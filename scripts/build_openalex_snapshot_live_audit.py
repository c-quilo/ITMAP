#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


SUPABASE_COUNTS = Path("/Users/caq13/Documents/ITMAP/supabase_author_paper_counts.csv")
SNAPSHOT_COUNTS = Path("/Users/caq13/Documents/ITMAP/openalex_snapshot_author_counts.csv")
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/openalex_snapshot_live_count_audit.csv")


def parse_args():
    parser = argparse.ArgumentParser(description="Compare Supabase, OpenAlex snapshot, and live OpenAlex author counts.")
    parser.add_argument("--supabase-counts", type=Path, default=SUPABASE_COUNTS)
    parser.add_argument("--snapshot-counts", type=Path, default=SNAPSHOT_COUNTS)
    parser.add_argument("--out", type=Path, default=OUT_CSV)
    parser.add_argument("--live-limit", type=int, default=250)
    parser.add_argument("--sleep", type=float, default=0.12)
    return parser.parse_args()


def int_value(value) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def fetch_live_author(openalex_id: str) -> dict:
    url = f"https://api.openalex.org/authors/{urllib.parse.quote(openalex_id)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    args = parse_args()
    supabase_rows = load_csv(args.supabase_counts)
    snapshot_by_id = {row["openalex_id"]: row for row in load_csv(args.snapshot_counts)}

    audit_rows = []
    for row in supabase_rows:
        snapshot = snapshot_by_id.get(row["openalex_id"], {})
        supabase_count = int_value(row.get("supabase_paper_count"))
        snapshot_count = int_value(snapshot.get("snapshot_works_count"))
        audit_rows.append(
            {
                **row,
                "snapshot_display_name": snapshot.get("snapshot_display_name", ""),
                "snapshot_works_count": snapshot_count,
                "snapshot_cited_by_count": int_value(snapshot.get("snapshot_cited_by_count")),
                "snapshot_minus_supabase": snapshot_count - supabase_count,
                "live_display_name": "",
                "live_works_count": "",
                "live_cited_by_count": "",
                "live_minus_snapshot": "",
                "live_minus_supabase": "",
                "audit_status": "snapshot_gap" if snapshot_count > supabase_count else "ok_or_live_unknown",
            }
        )

    suspicious = sorted(
        [
            row
            for row in audit_rows
            if int_value(row["snapshot_works_count"]) > int_value(row["supabase_paper_count"])
        ],
        key=lambda row: int_value(row["snapshot_minus_supabase"]),
        reverse=True,
    )
    selected = suspicious[: args.live_limit]
    selected_ids = {row["openalex_id"] for row in selected}
    print(f"Rows: {len(audit_rows)}")
    print(f"Snapshot gaps: {len(suspicious)}")
    print(f"Checking live OpenAlex for top snapshot gaps: {len(selected)}")

    for index, row in enumerate(audit_rows, start=1):
        if row["openalex_id"] not in selected_ids:
            continue
        live = fetch_live_author(row["openalex_id"])
        live_count = int_value(live.get("works_count"))
        snapshot_count = int_value(row["snapshot_works_count"])
        supabase_count = int_value(row["supabase_paper_count"])
        row["live_display_name"] = live.get("display_name", "")
        row["live_works_count"] = live_count
        row["live_cited_by_count"] = int_value(live.get("cited_by_count"))
        row["live_minus_snapshot"] = live_count - snapshot_count
        row["live_minus_supabase"] = live_count - supabase_count
        if live_count > snapshot_count:
            row["audit_status"] = "live_newer_than_snapshot"
        elif snapshot_count > supabase_count:
            row["audit_status"] = "supabase_missing_snapshot_works"
        else:
            row["audit_status"] = "ok"
        if index % 25 == 0:
            print(f"Checked through audit row {index}/{len(audit_rows)}", flush=True)
        time.sleep(args.sleep)

    fieldnames = list(audit_rows[0].keys()) if audit_rows else []
    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(audit_rows)
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
