#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path


SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""

# These profiles have authoritative manual identity corrections and must not be
# reassigned by name-only matching during a future bulk refresh.
MANUAL_REVIEW_RESEARCHER_IDS = {
    "498139a4-c2a1-470e-98a0-87bae96e1e04",  # Richard Jones (r.l.jones)
    "386fa8af-5b87-4641-b868-c5e6a6cfed27",  # Nigel Brandon (n.brandon)
    "71e26e1b-1553-4609-9842-e79e1d70f784",  # Fangxin Fang (f.fang)
    "9317784d-4933-43e9-97ce-85c2dc751954",  # Cesar Quilodran Casas (c.quilodran)
    "1705ab48-5326-4e8e-90c8-ac90e881bff4",  # Guo Li (g.li)
}


def parse_args():
    parser = argparse.ArgumentParser(description="Apply high-confidence OpenAlex author matches to Supabase.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--applied-out", type=Path)
    parser.add_argument("--review-out", type=Path)
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


def request_json(url: str, method: str = "GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = resp.read().decode("utf-8")
        return json.loads(text) if text else None


STOP_NAME_TOKENS = {
    "dr",
    "doctor",
    "mr",
    "mrs",
    "ms",
    "miss",
    "prof",
    "professor",
    "sir",
    "dame",
    "jr",
    "sr",
    "ii",
    "iii",
    "iv",
}


def name_tokens(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", (value or "").casefold())
        if token not in STOP_NAME_TOKENS and len(token) > 1
    ]


def has_safe_name_overlap(row: dict) -> bool:
    input_tokens = name_tokens(row.get("full_name", ""))
    candidate_tokens = name_tokens(row.get("openalex_display_name", ""))
    if not input_tokens or not candidate_tokens:
        return False
    if input_tokens == candidate_tokens:
        return True
    if len(input_tokens) <= 2:
        return input_tokens[0] == candidate_tokens[0] and input_tokens[-1] == candidate_tokens[-1]
    return all(token in candidate_tokens for token in input_tokens)


def is_safe_match(row: dict) -> bool:
    reason = row.get("match_reason", "")
    try:
        score_margin = float(row.get("score_margin") or 0)
    except ValueError:
        score_margin = 0
    has_imperial = str(row.get("has_imperial_affiliation", "")).lower() == "true"

    if reason == "orcid":
        return True
    if reason == "exact_name" and has_safe_name_overlap(row) and score_margin >= 50:
        return True
    if reason == "first_last+imperial" and has_imperial and score_margin >= 100 and has_safe_name_overlap(row):
        return True
    return False


def selected_rows(path: Path) -> tuple[list[dict], list[dict]]:
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
    best_by_researcher = {}
    review_rows = []
    for row in rows:
        if row.get("confidence_bucket") != "auto":
            review_rows.append(row)
            continue
        researcher_id = row.get("researcher_id")
        if not researcher_id:
            review_rows.append(row)
            continue
        if researcher_id in MANUAL_REVIEW_RESEARCHER_IDS:
            review_rows.append(row)
            continue
        if not is_safe_match(row):
            review_rows.append(row)
            continue
        current = best_by_researcher.get(researcher_id)
        if current is None or float(row.get("score") or 0) > float(current.get("score") or 0):
            best_by_researcher[researcher_id] = row
    selected = list(best_by_researcher.values())
    selected_ids = {row.get("researcher_id") for row in selected}
    review_rows.extend(
        row
        for row in rows
        if row.get("confidence_bucket") == "auto" and row.get("researcher_id") not in selected_ids
    )
    return selected, review_rows


def write_rows(path: Path | None, rows: list[dict]):
    if not path or not rows:
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    rows, review_rows = selected_rows(args.csv_in)
    write_rows(args.applied_out, rows)
    write_rows(args.review_out, review_rows)
    print(f"Safe auto matches selected: {len(rows)}")
    print(f"Rows left for review: {len(review_rows)}")
    if args.applied_out:
        print(f"Applied CSV: {args.applied_out}")
    if args.review_out:
        print(f"Review CSV: {args.review_out}")
    for index, row in enumerate(rows, start=1):
        print(
            f"{index:04d}. {row.get('full_name')} -> {row.get('openalex_id')} "
            f"{row.get('openalex_display_name')} ({row.get('match_reason')}, score {row.get('score')})",
            flush=True,
        )
        if args.dry_run:
            continue
        request_json(
            f"{SUPABASE_URL}/rest/v1/researchers?id=eq.{row['researcher_id']}",
            method="PATCH",
            body={"openalex_id": row["openalex_id"]},
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
