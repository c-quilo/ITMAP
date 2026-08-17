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
TOP_COAUTHORS_PER_RESEARCHER = 100
TOP_PAPERS_PER_COAUTHOR = 5
MIN_PUBLICATION_YEAR = 1970
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(description="Aggregate Athena OpenAlex co-author export into Supabase.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--state-path", type=Path, default=Path("/Users/caq13/Documents/ITMAP/athena_coauthors_import_state.json"))
    parser.add_argument("--openalex-id-file", type=Path, help="Only aggregate researcher IDs listed in this file.")
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
        except (ConnectionError, OSError, TimeoutError, socket.timeout, urllib.error.URLError) as error:
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
    return set(data.get("completed_researcher_openalex_ids", []))


def save_state(path: Path, completed: set[str]):
    path.write_text(json.dumps({"completed_researcher_openalex_ids": sorted(completed)}, indent=2), encoding="utf-8")


def load_allowed_openalex_ids(path: Path | None) -> set[str]:
    if not path:
        return set()
    return {
        compact(value)
        for value in path.read_text(encoding="utf-8").replace(",", "\n").splitlines()
        if compact(value).startswith("A")
    }


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


def upsert_rows(rows: list[dict]) -> int:
    uploaded = 0
    for batch in chunks(rows, SUPABASE_BATCH_SIZE):
        result = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_coauthors?on_conflict=researcher_id,coauthor_openalex_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
            body=batch,
        )
        uploaded += len(result or [])
    return uploaded


def sorted_papers(papers: list[dict]) -> list[dict]:
    return sorted(
        papers,
        key=lambda paper: (
            int(paper.get("citations") or 0),
            int(paper.get("year") or 0),
            str(paper.get("title") or ""),
        ),
        reverse=True,
    )[:TOP_PAPERS_PER_COAUTHOR]


def flush_researcher(
    researcher_openalex_id: str,
    coauthors: dict[str, dict],
    researcher_ids_by_openalex: dict[str, list[str]],
    completed: set[str],
    dry_run: bool,
) -> tuple[int, int]:
    if not researcher_openalex_id or researcher_openalex_id in completed:
        return 0, 0
    researcher_ids = researcher_ids_by_openalex.get(researcher_openalex_id, [])
    if not researcher_ids:
        completed.add(researcher_openalex_id)
        return 0, 0

    ranked = sorted(
        coauthors.values(),
        key=lambda item: (
            int(item["shared_papers"]),
            int(item["total_citations"]),
            int(item["latest_year"] or 0),
            str(item["name"]),
        ),
        reverse=True,
    )[:TOP_COAUTHORS_PER_RESEARCHER]

    rows = []
    for researcher_id in researcher_ids:
        for coauthor in ranked:
            rows.append({
                "researcher_id": researcher_id,
                "coauthor_openalex_id": coauthor["openalex_id"],
                "coauthor_name": coauthor["name"],
                "shared_papers": coauthor["shared_papers"],
                "institution_names": sorted(coauthor["institutions"])[:8],
                "latest_year": coauthor["latest_year"],
                "total_citations": coauthor["total_citations"],
                "paper_titles": sorted_papers(coauthor["papers"]),
            })

    uploaded = 0 if dry_run or not rows else upsert_rows(rows)
    completed.add(researcher_openalex_id)
    return len(rows), uploaded


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    completed = load_state(args.state_path, args.reset_state)
    allowed_openalex_ids = load_allowed_openalex_ids(args.openalex_id_file)
    researcher_ids_by_openalex = load_researcher_ids_by_openalex()
    print(f"Loaded OpenAlex IDs: {len(researcher_ids_by_openalex)}")
    print(f"Already completed researchers: {len(completed)}")
    if allowed_openalex_ids:
        print(f"Restricted to OpenAlex IDs: {len(allowed_openalex_ids)}")

    total_seen = 0
    total_prepared = 0
    total_uploaded = 0
    current_researcher = ""
    current_coauthors: dict[str, dict] = {}

    with args.csv_in.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            total_seen += 1
            researcher_openalex_id = compact(raw.get("researcher_openalex_id"))
            if allowed_openalex_ids and researcher_openalex_id not in allowed_openalex_ids:
                continue
            if current_researcher and researcher_openalex_id != current_researcher:
                prepared, uploaded = flush_researcher(
                    current_researcher,
                    current_coauthors,
                    researcher_ids_by_openalex,
                    completed,
                    args.dry_run,
                )
                total_prepared += prepared
                total_uploaded += uploaded
                if len(completed) > 0 and len(completed) % 50 == 0:
                    save_state(args.state_path, completed)
                    print(
                        f"Seen {total_seen}; researchers {len(completed)}; prepared {total_prepared}; uploaded {total_uploaded}",
                        flush=True,
                    )
                current_coauthors = {}

            current_researcher = researcher_openalex_id
            if researcher_openalex_id in completed:
                continue

            coauthor_id = compact(raw.get("coauthor_openalex_id"))
            coauthor_name = compact(raw.get("coauthor_name"))
            if not researcher_openalex_id or not coauthor_id or not coauthor_name:
                continue
            year_value = compact(raw.get("publication_year"))
            citation_value = compact(raw.get("cited_by_count"))
            year = int(year_value) if year_value.isdigit() else None
            if year is not None and year < MIN_PUBLICATION_YEAR:
                continue
            citations = int(citation_value) if citation_value.isdigit() else 0
            coauthor = current_coauthors.setdefault(coauthor_id, {
                "openalex_id": coauthor_id,
                "name": coauthor_name,
                "shared_papers": 0,
                "institutions": set(),
                "latest_year": None,
                "total_citations": 0,
                "papers": [],
            })
            coauthor["shared_papers"] += 1
            coauthor["total_citations"] += citations
            if year and (coauthor["latest_year"] is None or year > coauthor["latest_year"]):
                coauthor["latest_year"] = year
            for institution in parse_json_array(raw.get("institution_names_json", "")):
                coauthor["institutions"].add(institution)
            title = compact(raw.get("title"))
            if title:
                coauthor["papers"].append({
                    "title": title,
                    "year": year,
                    "citations": citations,
                    "openalex_work_id": compact(raw.get("openalex_work_id")),
                })

    if current_researcher:
        prepared, uploaded = flush_researcher(
            current_researcher,
            current_coauthors,
            researcher_ids_by_openalex,
            completed,
            args.dry_run,
        )
        total_prepared += prepared
        total_uploaded += uploaded

    if not args.dry_run:
        save_state(args.state_path, completed)

    print("Done")
    print(f"Rows seen: {total_seen}")
    print(f"Rows prepared: {total_prepared}")
    print(f"Rows uploaded: {total_uploaded}")
    print(f"State file: {args.state_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
