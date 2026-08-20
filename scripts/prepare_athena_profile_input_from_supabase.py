#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


REGION = "us-east-1"
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_supabase_athena_input.csv")
OUT_S3 = "s3://openalex-june-2026/athena-inputs/openalex-profiles-current/imperial_profiles_openalex_supabase_athena_input.csv"

SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""


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


def supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


def request_json(url: str):
    req = urllib.request.Request(url)
    for key, value in supabase_headers().items():
        req.add_header(key, value)
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = resp.read().decode("utf-8")
        return json.loads(text) if text else None


def load_researchers() -> list[dict]:
    rows = []
    offset = 0
    while True:
        params = {
            "select": "profile_url,full_name,openalex_id",
            "openalex_id": "not.is.null",
            "order": "full_name.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        url = f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}"
        batch = request_json(url) or []
        rows.extend(row for row in batch if row.get("openalex_id"))
        if len(batch) < 1000:
            return rows
        offset += 1000


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    researchers = load_researchers()
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["ord", "profile_url", "full_name", "openalex_id"])
        writer.writeheader()
        for index, row in enumerate(researchers, start=1):
            writer.writerow({
                "ord": index,
                "profile_url": row.get("profile_url", ""),
                "full_name": row.get("full_name", ""),
                "openalex_id": row.get("openalex_id", ""),
            })

    subprocess.check_call(["/opt/homebrew/bin/aws", "s3", "cp", str(OUT_CSV), OUT_S3, "--region", REGION])
    print(f"Wrote {OUT_CSV}")
    print(f"Uploaded {OUT_S3}")
    print(f"Researchers with OpenAlex IDs: {len(researchers)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
