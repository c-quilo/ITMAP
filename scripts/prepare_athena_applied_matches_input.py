#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import subprocess
from pathlib import Path


REGION = "us-east-1"
OUT_S3 = "s3://openalex-june-2026/athena-inputs/openalex-profiles-current/imperial_profiles_openalex_supabase_athena_input.csv"


def parse_args():
    parser = argparse.ArgumentParser(description="Create the Athena author input CSV from applied OpenAlex matches.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument(
        "--csv-out",
        type=Path,
        default=Path("/Users/caq13/Documents/ITMAP/imperial_profiles_applied_matches_athena_input.csv"),
    )
    parser.add_argument("--upload", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with args.csv_in.open(newline="", encoding="utf-8") as source, args.csv_out.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=["ord", "profile_url", "full_name", "openalex_id"])
        writer.writeheader()
        count = 0
        seen = set()
        for row in reader:
            openalex_id = (row.get("openalex_id") or "").strip()
            if not openalex_id or openalex_id in seen:
                continue
            seen.add(openalex_id)
            count += 1
            writer.writerow(
                {
                    "ord": count,
                    "profile_url": row.get("profile_url", ""),
                    "full_name": row.get("full_name", ""),
                    "openalex_id": openalex_id,
                }
            )

    print(f"Wrote {count} unique OpenAlex IDs to {args.csv_out}")
    if args.upload:
        subprocess.check_call(["/opt/homebrew/bin/aws", "s3", "cp", str(args.csv_out), OUT_S3, "--region", REGION])
        print(f"Uploaded {OUT_S3}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
