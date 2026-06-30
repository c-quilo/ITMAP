#!/usr/bin/env python3
import csv
import subprocess
from pathlib import Path

REGION = "us-east-1"
SOURCE_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_openalex.csv")
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_athena_input.csv")
OUT_S3 = "s3://openalex-june-2026/athena-inputs/openalex-profiles/imperial_profiles_openalex_athena_input.csv"


def main() -> int:
    with SOURCE_CSV.open(newline="", encoding="utf-8") as f, OUT_CSV.open("w", newline="", encoding="utf-8") as out:
        reader = csv.DictReader(f)
        writer = csv.DictWriter(out, fieldnames=["ord", "profile_url", "full_name", "openalex_id"])
        writer.writeheader()
        for idx, row in enumerate(reader, start=1):
            writer.writerow({
                "ord": idx,
                "profile_url": row.get("url", ""),
                "full_name": row.get("full_name", ""),
                "openalex_id": row.get("openalex_id", ""),
            })

    subprocess.check_call(["aws", "s3", "cp", str(OUT_CSV), OUT_S3, "--region", REGION])
    print(f"Wrote {OUT_CSV}")
    print(f"Uploaded {OUT_S3}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
