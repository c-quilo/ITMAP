#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


SUPABASE_BATCH_SIZE = 250
MIN_PUBLICATION_YEAR = 1970
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(description="Import Athena OpenAlex author-paper export into Supabase.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--state-path", type=Path, default=Path("/Users/caq13/Documents/ITMAP/athena_paper_import_state.json"))
    parser.add_argument("--reset-state", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value.rstrip("/")


def require_supabase_url() -> str:
    value = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not value:
        raise SystemExit("Missing required environment variable: SUPABASE_URL or VITE_SUPABASE_URL")
    return value.rstrip("/")


def request_json(url: str, method: str = "GET", body=None, headers=None, timeout=180):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for attempt in range(1, 6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after HTTP {error.code}; attempt {attempt}/5 in {wait}s", flush=True)
            time.sleep(wait)
        except (TimeoutError, socket.timeout, urllib.error.URLError) as error:
            if attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after network error; attempt {attempt}/5 in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"{method} {url} failed after retries")


def supabase_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def compact(value) -> str:
    return " ".join(str(value or "").split())


def restore_abstract(raw_json: str) -> str:
    if not raw_json:
        return ""
    try:
        inverted = json.loads(raw_json)
    except json.JSONDecodeError:
        return ""
    if not isinstance(inverted, dict):
        return ""
    positions = []
    for word, indexes in inverted.items():
        if not isinstance(indexes, list):
            continue
        for index in indexes:
            try:
                positions.append((int(index), word))
            except (TypeError, ValueError):
                continue
    return " ".join(word for _, word in sorted(positions))


def load_state(path: Path, reset: bool) -> set[str]:
    if reset or not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    return set(data.get("completed_work_keys", []))


def save_state(path: Path, completed: set[str]):
    path.write_text(json.dumps({"completed_work_keys": sorted(completed)}, indent=2), encoding="utf-8")


def load_researcher_ids_by_openalex() -> dict[str, list[str]]:
    rows = []
    offset = 0
    while True:
        params = {
            "select": "id,openalex_id",
            "openalex_id": "not.is.null",
            "limit": "1000",
            "offset": str(offset),
        }
        url = f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}"
        batch = request_json(url, headers=supabase_headers()) or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    researcher_ids: dict[str, list[str]] = {}
    for row in rows:
        if row.get("openalex_id") and row.get("id"):
            researcher_ids.setdefault(row["openalex_id"], []).append(row["id"])
    return researcher_ids


def dedupe_rows(rows: list[dict]) -> list[dict]:
    deduped = {}
    for row in rows:
        key = (row.get("researcher_id"), row.get("openalex_work_id"))
        if key[0] and key[1] and key not in deduped:
            deduped[key] = row
    return list(deduped.values())


def upsert_rows(rows: list[dict]) -> int:
    uploaded = 0
    for batch in chunks(dedupe_rows(rows), SUPABASE_BATCH_SIZE):
        result = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_papers?on_conflict=researcher_id,openalex_work_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
            body=batch,
        )
        uploaded += len(result or [])
    return uploaded


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    completed = load_state(args.state_path, args.reset_state)
    researcher_ids = load_researcher_ids_by_openalex()
    print(f"Loaded OpenAlex IDs: {len(researcher_ids)}")
    print(f"Already imported work keys: {len(completed)}")

    total_seen = 0
    total_prepared = 0
    total_uploaded = 0
    pending = []
    pending_keys = []

    with args.csv_in.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            total_seen += 1
            author_id = row.get("researcher_openalex_id", "")
            work_id = row.get("openalex_work_id", "")
            matched_researcher_ids = researcher_ids.get(author_id, [])
            if not matched_researcher_ids or not work_id:
                continue
            title = compact(row.get("title"))
            if not title:
                continue
            publication_year = int(row["publication_year"]) if str(row.get("publication_year", "")).isdigit() else None
            if publication_year is not None and publication_year < MIN_PUBLICATION_YEAR:
                continue
            for researcher_id in matched_researcher_ids:
                key = f"{researcher_id}:{work_id}"
                if key in completed:
                    continue
                pending.append({
                    "researcher_id": researcher_id,
                    "openalex_work_id": work_id,
                    "title": title,
                    "abstract": compact(restore_abstract(row.get("abstract_inverted_index_json", ""))) or None,
                    "publication_year": publication_year,
                    "cited_by_count": int(row["cited_by_count"]) if str(row.get("cited_by_count", "")).isdigit() else None,
                    "source_display_name": compact(row.get("source_display_name")) or None,
                    "doi": row.get("doi") or None,
                })
                pending_keys.append(key)
                total_prepared += 1

            if len(pending) >= SUPABASE_BATCH_SIZE:
                pending = dedupe_rows(pending)
                pending_keys = [f"{row['researcher_id']}:{row['openalex_work_id']}" for row in pending]
                if not args.dry_run:
                    total_uploaded += upsert_rows(pending)
                    completed.update(pending_keys)
                    save_state(args.state_path, completed)
                print(f"Seen {total_seen}; prepared {total_prepared}; uploaded {total_uploaded}", flush=True)
                pending = []
                pending_keys = []

    if pending:
        if not args.dry_run:
            total_uploaded += upsert_rows(pending)
            completed.update(pending_keys)
            save_state(args.state_path, completed)
        print(f"Seen {total_seen}; prepared {total_prepared}; uploaded {total_uploaded}", flush=True)

    print("Done")
    print(f"Rows seen: {total_seen}")
    print(f"Rows prepared: {total_prepared}")
    print(f"Rows uploaded: {total_uploaded}")
    print(f"State file: {args.state_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
