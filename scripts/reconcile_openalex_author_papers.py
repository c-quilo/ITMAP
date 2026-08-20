#!/usr/bin/env python3
from __future__ import annotations

"""Concurrent OpenAlex author-paper reconciliation for ITMAP.

For every researcher with a verified OpenAlex author ID, this script fetches all
works for that author ID and upserts any missing rows into researcher_papers.
It does not delete extra rows; over-counts are written to the audit CSV for
manual review because they may indicate earlier bad author matches.
"""

import argparse
import csv
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from types import SimpleNamespace

import backfill_openalex_author_works as base


DEFAULT_STATE_PATH = Path("/Users/caq13/Documents/ITMAP/openalex_author_metadata_reconcile_state.json")
DEFAULT_AUDIT_PATH = Path("/Users/caq13/Documents/ITMAP/openalex_author_paper_audit.csv")


def parse_args():
    parser = argparse.ArgumentParser(description="Reconcile Supabase author papers with all OpenAlex author works.")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--state-path", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--audit-path", type=Path, default=DEFAULT_AUDIT_PATH)
    parser.add_argument("--reset-state", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit-researchers", type=int, default=0)
    parser.add_argument("--name", default="")
    parser.add_argument("--sleep", type=float, default=0.0)
    return parser.parse_args()


def init_base():
    base.SUPABASE_URL = base.require_supabase_url()
    base.SUPABASE_SERVICE_ROLE_KEY = base.require_env("SUPABASE_SERVICE_ROLE_KEY")


def load_completed(path: Path, reset: bool) -> set[str]:
    if reset or not path.exists():
        return set()
    try:
      data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
      return set()
    return set(data.get("completed_researcher_ids", []))


def save_completed(path: Path, completed: set[str]):
    path.write_text(
        json.dumps({"completed_researcher_ids": sorted(completed)}, indent=2),
        encoding="utf-8",
    )


def load_researchers(args):
    return base.load_researchers(SimpleNamespace(
        name=args.name,
        openalex_id="",
        limit_researchers=args.limit_researchers,
    ))


def reconcile_researcher(researcher: dict, dry_run: bool, sleep_seconds: float) -> dict:
    researcher_id = researcher["id"]
    author_id = researcher.get("openalex_id", "")
    if sleep_seconds:
        time.sleep(sleep_seconds)

    works = base.fetch_openalex_works(author_id, sleep_seconds)
    existing = base.existing_papers_by_work_id(researcher_id)
    rows = [base.paper_row(researcher_id, work) for work in works]
    rows = [row for row in rows if row and row.get("openalex_work_id")]
    new_rows = [row for row in rows if row["openalex_work_id"] not in existing]

    upserted_count = 0
    if new_rows and not dry_run:
        upserted_count = len(base.upsert_paper_rows(new_rows))

    return {
        "researcher_id": researcher_id,
        "full_name": researcher.get("full_name", ""),
        "openalex_id": author_id,
        "faculty": researcher.get("faculty", ""),
        "openalex_works_count": len(works),
        "supabase_existing_count": len(existing),
        "missing_count": len(new_rows),
        "upserted_count": upserted_count,
        "over_count": max(0, len(existing) - len(rows)),
        "status": (
            "over_count_review"
            if len(existing) > len(rows)
            else "missing_papers"
              if new_rows
              else "ok"
        ),
    }


def main() -> int:
    args = parse_args()
    init_base()
    completed = load_completed(args.state_path, args.reset_state)
    researchers = load_researchers(args)
    pending = [row for row in researchers if row["id"] not in completed]

    print(f"Loaded researchers with OpenAlex IDs: {len(researchers)}", flush=True)
    print(f"Already completed: {len(completed)}", flush=True)
    print(f"Pending: {len(pending)}", flush=True)
    print(f"Workers: {args.workers}", flush=True)

    results = []
    write_lock = threading.Lock()
    completed_lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        future_map = {
            pool.submit(reconcile_researcher, researcher, args.dry_run, args.sleep): researcher
            for researcher in pending
        }
        for index, future in enumerate(as_completed(future_map), start=1):
            researcher = future_map[future]
            try:
                result = future.result()
            except Exception as error:
                result = {
                    "researcher_id": researcher["id"],
                    "full_name": researcher.get("full_name", ""),
                    "openalex_id": researcher.get("openalex_id", ""),
                    "faculty": researcher.get("faculty", ""),
                    "openalex_works_count": "",
                    "supabase_existing_count": "",
                    "missing_count": "",
                    "upserted_count": "",
                    "over_count": "",
                    "status": f"error: {error}",
                }
                print(f"[{index}/{len(pending)}] ERROR {result['full_name']}: {error}", flush=True)
            else:
                print(
                    f"[{index}/{len(pending)}] {result['full_name']} "
                    f"OA={result['openalex_works_count']} DB={result['supabase_existing_count']} "
                    f"missing={result['missing_count']} upserted={result['upserted_count']} "
                    f"{result['status']}",
                    flush=True,
                )

            with write_lock:
                results.append(result)
            if not args.dry_run and not str(result["status"]).startswith("error"):
                with completed_lock:
                    completed.add(result["researcher_id"])
                    save_completed(args.state_path, completed)

    fieldnames = [
        "researcher_id",
        "full_name",
        "openalex_id",
        "faculty",
        "openalex_works_count",
        "supabase_existing_count",
        "missing_count",
        "upserted_count",
        "over_count",
        "status",
    ]
    with args.audit_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(results, key=lambda row: str(row.get("full_name", "")).casefold()))

    print("Done", flush=True)
    print(f"Audit CSV: {args.audit_path}", flush=True)
    print(f"State file: {args.state_path}", flush=True)
    print(f"Total missing found: {sum(int(row['missing_count'] or 0) for row in results if str(row.get('missing_count', '')).isdigit())}", flush=True)
    print(f"Total upserted: {sum(int(row['upserted_count'] or 0) for row in results if str(row.get('upserted_count', '')).isdigit())}", flush=True)
    print(f"Over-count rows to review: {sum(1 for row in results if row.get('status') == 'over_count_review')}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
