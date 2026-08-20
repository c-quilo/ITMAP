#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path


OUT_CSV = Path("/Users/caq13/Documents/ITMAP/supabase_author_paper_counts.csv")
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


def request_json(path: str):
    req = urllib.request.Request(f"{SUPABASE_URL}{path}")
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    with urllib.request.urlopen(req, timeout=180) as resp:
        text = resp.read().decode("utf-8")
        return json.loads(text) if text else None


def paged(table: str, params: dict[str, str], page_size: int = 1000):
    offset = 0
    while True:
        query = dict(params)
        query["limit"] = str(page_size)
        query["offset"] = str(offset)
        rows = request_json(f"/rest/v1/{table}?{urllib.parse.urlencode(query)}") or []
        yield from rows
        if len(rows) < page_size:
            break
        offset += page_size


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")

    researchers = list(
        paged(
            "researchers",
            {
                "select": "id,full_name,openalex_id,affiliation,faculty,position_name",
                "openalex_id": "not.is.null",
                "order": "full_name.asc",
            },
        )
    )
    paper_counts = Counter(
        row["researcher_id"]
        for row in paged("researcher_papers", {"select": "researcher_id"}, page_size=1000)
        if row.get("researcher_id")
    )
    document_counts = Counter(
        row["researcher_id"]
        for row in paged("researcher_paper_documents", {"select": "researcher_id"}, page_size=1000)
        if row.get("researcher_id")
    )

    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "researcher_id",
                "full_name",
                "openalex_id",
                "affiliation",
                "faculty",
                "position_name",
                "supabase_paper_count",
                "supabase_paper_document_count",
            ],
        )
        writer.writeheader()
        for researcher in researchers:
            researcher_id = researcher["id"]
            writer.writerow(
                {
                    "researcher_id": researcher_id,
                    "full_name": researcher.get("full_name", ""),
                    "openalex_id": researcher.get("openalex_id", ""),
                    "affiliation": researcher.get("affiliation", ""),
                    "faculty": researcher.get("faculty", ""),
                    "position_name": researcher.get("position_name", ""),
                    "supabase_paper_count": paper_counts[researcher_id],
                    "supabase_paper_document_count": document_counts[researcher_id],
                }
            )
    print(f"Wrote {len(researchers)} rows to {OUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
