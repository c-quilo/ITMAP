#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Filter full OpenAlex paper export to a safer author-count subset.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--csv-out", type=Path, required=True)
    parser.add_argument("--skipped-out", type=Path, required=True)
    parser.add_argument("--max-author-papers", type=int, default=1000)
    parser.add_argument("--include-openalex-id", action="append", default=[])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    counts = Counter()
    with args.csv_in.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            counts[row["researcher_openalex_id"]] += 1

    include_ids = set(args.include_openalex_id)
    safe_ids = {
        openalex_id
        for openalex_id, count in counts.items()
        if count <= args.max_author_papers or openalex_id in include_ids
    }
    skipped = sorted(
        ((openalex_id, count) for openalex_id, count in counts.items() if openalex_id not in safe_ids),
        key=lambda item: item[1],
        reverse=True,
    )

    written = 0
    with args.csv_in.open(newline="", encoding="utf-8") as source, args.csv_out.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if row["researcher_openalex_id"] not in safe_ids:
                continue
            writer.writerow(row)
            written += 1

    with args.skipped_out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["openalex_id", "full_snapshot_paper_count"])
        writer.writeheader()
        for openalex_id, count in skipped:
            writer.writerow({"openalex_id": openalex_id, "full_snapshot_paper_count": count})

    print(f"Input authors: {len(counts)}")
    print(f"Safe authors: {len(safe_ids)}")
    print(f"Skipped authors: {len(skipped)}")
    print(f"Rows written: {written}")
    print(f"CSV out: {args.csv_out}")
    print(f"Skipped out: {args.skipped_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
