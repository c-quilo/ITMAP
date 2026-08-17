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


SUPABASE_BATCH_SIZE = 500
LOOKUP_BATCH_SIZE = 200
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(description="Import Athena OpenAlex co-author export into Supabase.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--state-path", type=Path, default=Path("/Users/caq13/Documents/ITMAP/athena_paper_authors_import_state.json"))
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


def parse_json_array(value: str) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [compact(item) for item in data if compact(item)]


def load_state(path: Path, reset: bool) -> set[str]:
    if reset or not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    return set(data.get("completed_keys", []))


def save_state(path: Path, completed: set[str]):
    path.write_text(json.dumps({"completed_keys": sorted(completed)}, indent=2), encoding="utf-8")


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
        batch = request_json(
            f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}",
            headers=supabase_headers(),
        ) or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    researcher_ids: dict[str, list[str]] = {}
    for row in rows:
        if row.get("openalex_id") and row.get("id"):
            researcher_ids.setdefault(row["openalex_id"], []).append(row["id"])
    return researcher_ids


def load_paper_ids(researcher_ids: set[str], work_ids: set[str]) -> dict[tuple[str, str], str]:
    paper_ids: dict[tuple[str, str], str] = {}
    researcher_batches = list(chunks(sorted(researcher_ids), LOOKUP_BATCH_SIZE))
    work_batches = list(chunks(sorted(work_ids), LOOKUP_BATCH_SIZE))
    for researcher_batch in researcher_batches:
        for work_batch in work_batches:
            params = {
                "select": "id,researcher_id,openalex_work_id",
                "researcher_id": f"in.({','.join(researcher_batch)})",
                "openalex_work_id": f"in.({','.join(urllib.parse.quote(item, safe='') for item in work_batch)})",
                "limit": "1000",
            }
            rows = request_json(
                f"{SUPABASE_URL}/rest/v1/researcher_papers?{urllib.parse.urlencode(params, safe='(),')}",
                headers=supabase_headers(),
            ) or []
            for row in rows:
                if row.get("researcher_id") and row.get("openalex_work_id") and row.get("id"):
                    paper_ids[(row["researcher_id"], row["openalex_work_id"])] = row["id"]
    return paper_ids


def dedupe_rows(rows: list[dict]) -> list[dict]:
    deduped = {}
    for row in rows:
        key = (row.get("paper_id"), row.get("coauthor_openalex_id"))
        if key[0] and key[1] and key not in deduped:
            deduped[key] = row
    return list(deduped.values())


def upsert_rows(rows: list[dict]) -> int:
    uploaded = 0
    for batch in chunks(dedupe_rows(rows), SUPABASE_BATCH_SIZE):
        result = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_authors?on_conflict=paper_id,coauthor_openalex_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
            body=batch,
        )
        uploaded += len(result or [])
    return uploaded


def prepare_rows(buffer: list[dict], researcher_ids_by_openalex: dict[str, list[str]], completed: set[str]) -> tuple[list[dict], list[str]]:
    matched_researcher_ids: set[str] = set()
    work_ids: set[str] = set()
    for row in buffer:
        for researcher_id in researcher_ids_by_openalex.get(row["researcher_openalex_id"], []):
            matched_researcher_ids.add(researcher_id)
        if row["openalex_work_id"]:
            work_ids.add(row["openalex_work_id"])

    paper_ids = load_paper_ids(matched_researcher_ids, work_ids)
    prepared = []
    prepared_keys = []
    for row in buffer:
        for researcher_id in researcher_ids_by_openalex.get(row["researcher_openalex_id"], []):
            paper_id = paper_ids.get((researcher_id, row["openalex_work_id"]))
            if not paper_id:
                continue
            key = f"{paper_id}:{row['coauthor_openalex_id']}"
            if key in completed:
                continue
            prepared.append({
                "paper_id": paper_id,
                "researcher_id": researcher_id,
                "openalex_work_id": row["openalex_work_id"],
                "coauthor_openalex_id": row["coauthor_openalex_id"],
                "coauthor_name": row["coauthor_name"],
                "institution_ids": row["institution_ids"],
                "institution_names": row["institution_names"],
                "publication_year": row["publication_year"],
                "cited_by_count": row["cited_by_count"],
                "paper_title": row["paper_title"],
            })
            prepared_keys.append(key)
    return dedupe_rows(prepared), prepared_keys


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    completed = load_state(args.state_path, args.reset_state)
    researcher_ids_by_openalex = load_researcher_ids_by_openalex()
    print(f"Loaded OpenAlex IDs: {len(researcher_ids_by_openalex)}")
    print(f"Already imported co-author keys: {len(completed)}")

    total_seen = 0
    total_prepared = 0
    total_uploaded = 0
    buffer = []

    with args.csv_in.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            total_seen += 1
            researcher_openalex_id = compact(raw.get("researcher_openalex_id"))
            work_id = compact(raw.get("openalex_work_id"))
            coauthor_id = compact(raw.get("coauthor_openalex_id"))
            coauthor_name = compact(raw.get("coauthor_name"))
            if not researcher_openalex_id or not work_id or not coauthor_id or not coauthor_name:
                continue
            year_value = compact(raw.get("publication_year"))
            citation_value = compact(raw.get("cited_by_count"))
            buffer.append({
                "researcher_openalex_id": researcher_openalex_id,
                "openalex_work_id": work_id,
                "paper_title": compact(raw.get("title")) or None,
                "publication_year": int(year_value) if year_value.isdigit() else None,
                "cited_by_count": int(citation_value) if citation_value.isdigit() else None,
                "coauthor_openalex_id": coauthor_id,
                "coauthor_name": coauthor_name,
                "institution_ids": parse_json_array(raw.get("institution_ids_json", "")),
                "institution_names": parse_json_array(raw.get("institution_names_json", "")),
            })

            if len(buffer) >= 3000:
                rows, keys = prepare_rows(buffer, researcher_ids_by_openalex, completed)
                total_prepared += len(rows)
                if not args.dry_run and rows:
                    total_uploaded += upsert_rows(rows)
                    completed.update(keys)
                    save_state(args.state_path, completed)
                print(f"Seen {total_seen}; prepared {total_prepared}; uploaded {total_uploaded}", flush=True)
                buffer = []

    if buffer:
        rows, keys = prepare_rows(buffer, researcher_ids_by_openalex, completed)
        total_prepared += len(rows)
        if not args.dry_run and rows:
            total_uploaded += upsert_rows(rows)
            completed.update(keys)
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
