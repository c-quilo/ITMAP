#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


REGION = "us-east-1"
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_unmatched_athena_input.csv")
OUT_S3 = "s3://openalex-june-2026/athena-inputs/openalex-unmatched-profiles/imperial_profiles_unmatched_athena_input.csv"

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


def compact(value) -> str:
    return " ".join(str(value or "").split())


def text(row: dict, key: str) -> str:
    return str(row.get(key) or "")


def extract_orcid(row: dict) -> str:
    text = " ".join(str(row.get(key, "") or "") for key in row)
    found = re.findall(r"\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b", text)
    return found[0] if found else ""


def load_unmatched_researchers() -> list[dict]:
    rows = []
    offset = 0
    while True:
        params = {
            "select": "id,profile_url,full_name,email,bio_about,research,position_name,position,affiliation,faculty,fields_of_research",
            "openalex_id": "is.null",
            "order": "full_name.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        url = f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}"
        batch = request_json(url) or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    rows = load_unmatched_researchers()
    fieldnames = [
        "ord",
        "researcher_id",
        "profile_url",
        "full_name",
        "orcid",
        "position_name",
        "position",
        "affiliation",
        "faculty",
        "fields_of_research",
        "profile_text",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for index, row in enumerate(rows, start=1):
            profile_text = compact(" ".join([
                text(row, "bio_about"),
                text(row, "research"),
                text(row, "position_name"),
                text(row, "position"),
                text(row, "affiliation"),
                text(row, "faculty"),
                text(row, "fields_of_research"),
            ]))[:5000]
            writer.writerow({
                "ord": index,
                "researcher_id": row.get("id", ""),
                "profile_url": text(row, "profile_url"),
                "full_name": text(row, "full_name"),
                "orcid": extract_orcid(row),
                "position_name": text(row, "position_name"),
                "position": text(row, "position"),
                "affiliation": text(row, "affiliation"),
                "faculty": text(row, "faculty"),
                "fields_of_research": text(row, "fields_of_research"),
                "profile_text": profile_text,
            })

    subprocess.check_call(["/opt/homebrew/bin/aws", "s3", "rm", "s3://openalex-june-2026/athena-inputs/openalex-unmatched-profiles/", "--recursive", "--region", REGION])
    subprocess.check_call(["/opt/homebrew/bin/aws", "s3", "cp", str(OUT_CSV), OUT_S3, "--region", REGION])
    print(f"Wrote {OUT_CSV}")
    print(f"Uploaded {OUT_S3}")
    print(f"Unmatched researchers: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
