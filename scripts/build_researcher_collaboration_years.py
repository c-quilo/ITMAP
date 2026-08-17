#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import time
import unicodedata
from collections import defaultdict
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Build compact yearly collaboration summaries from the Athena authorship export.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--researchers-json", type=Path, required=True)
    parser.add_argument("--ndjson-out", type=Path, required=True)
    return parser.parse_args()


def openalex_key(value) -> str:
    return str(value or "").strip().rstrip("/").split("/")[-1].upper()


def group_key(value) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(character for character in text if unicodedata.category(character) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    if text == "institute for climate change":
        return "grantham institute for climate change"
    return text


def json_array(value) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item).strip() for item in data if str(item).strip()] if isinstance(data, list) else []


def profile_for_coauthor(profiles: list[dict]) -> dict:
    return next((profile for profile in profiles if profile.get("affiliation") or profile.get("faculty")), profiles[0])


def main() -> int:
    args = parse_args()
    profiles = json.loads(args.researchers_json.read_text(encoding="utf-8"))
    profiles_by_openalex: dict[str, list[dict]] = defaultdict(list)
    for profile in profiles:
        key = openalex_key(profile.get("openalex_id"))
        if key and profile.get("id"):
            profiles_by_openalex[key].append(profile)

    started = time.time()
    rows_seen = 0
    researchers_written = 0
    summaries_written = 0
    current_author = ""
    yearly: dict[int, dict] = {}
    first_year_by_coauthor: dict[str, int] = {}
    all_coauthors: set[str] = set()

    def reset():
        nonlocal yearly, first_year_by_coauthor, all_coauthors
        yearly = {}
        first_year_by_coauthor = {}
        all_coauthors = set()

    def add_row(row: dict):
        coauthor_id = openalex_key(row.get("coauthor_openalex_id"))
        work_id = str(row.get("openalex_work_id") or "").strip()
        year_text = str(row.get("publication_year") or "").strip()
        if not coauthor_id or not work_id or not year_text.isdigit():
            return
        year = int(year_text)
        if year < 1970 or year > 2100:
            return
        bucket = yearly.setdefault(year, {
            "active": set(),
            "works": set(),
            "other_institutions": set(),
            "counts": defaultdict(int),
            "names": {},
        })
        bucket["active"].add(coauthor_id)
        bucket["works"].add(work_id)
        bucket["counts"][coauthor_id] += 1
        bucket["names"][coauthor_id] = str(row.get("coauthor_name") or "").strip()
        all_coauthors.add(coauthor_id)
        first_year_by_coauthor[coauthor_id] = min(year, first_year_by_coauthor.get(coauthor_id, year))
        institutions = json_array(row.get("institution_names_json"))
        if coauthor_id not in profiles_by_openalex and not any("imperial college" in name.lower() for name in institutions):
            bucket["other_institutions"].add(coauthor_id)

    def flush(handle):
        nonlocal researchers_written, summaries_written
        focal_profiles = profiles_by_openalex.get(current_author, [])
        if not current_author or not focal_profiles or not yearly:
            reset()
            return
        matched_imperial = len({coauthor for coauthor in all_coauthors if coauthor in profiles_by_openalex})
        for focal in focal_profiles:
            focal_department = group_key(focal.get("affiliation"))
            focal_faculty = group_key(focal.get("faculty"))
            for year in sorted(yearly):
                bucket = yearly[year]
                imperial = {coauthor for coauthor in bucket["active"] if coauthor in profiles_by_openalex}
                cross_department = set()
                cross_faculty = set()
                for coauthor in imperial:
                    coauthor_profile = profile_for_coauthor(profiles_by_openalex[coauthor])
                    department = group_key(coauthor_profile.get("affiliation"))
                    faculty = group_key(coauthor_profile.get("faculty"))
                    if focal_department and department and department != focal_department:
                        cross_department.add(coauthor)
                    if focal_faculty and faculty and faculty != focal_faculty:
                        cross_faculty.add(coauthor)
                top_cross_department = []
                for coauthor in sorted(cross_department, key=lambda item: (-bucket["counts"][item], bucket["names"].get(item, "")))[:6]:
                    profile = profile_for_coauthor(profiles_by_openalex[coauthor])
                    top_cross_department.append({
                        "researcher_id": profile.get("id"),
                        "openalex_id": coauthor,
                        "name": profile.get("full_name") or bucket["names"].get(coauthor) or "Imperial researcher",
                        "department": profile.get("affiliation") or "",
                        "faculty": profile.get("faculty") or "",
                        "shared_papers": bucket["counts"][coauthor],
                    })
                output = {
                    "researcher_id": focal["id"],
                    "year": year,
                    "active_coauthors": len(bucket["active"]),
                    "new_coauthors": sum(1 for coauthor in bucket["active"] if first_year_by_coauthor.get(coauthor) == year),
                    "imperial_coauthors": len(imperial),
                    "cross_department": len(cross_department),
                    "cross_faculty": len(cross_faculty),
                    "other_institutions": len(bucket["other_institutions"]),
                    "shared_papers": len(bucket["works"]),
                    "total_coauthors": len(all_coauthors),
                    "matched_imperial_coauthors": matched_imperial,
                    "top_cross_department": top_cross_department,
                }
                handle.write(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
                summaries_written += 1
            researchers_written += 1
        reset()

    with args.csv_in.open(newline="", encoding="utf-8") as source, args.ndjson_out.open("w", encoding="utf-8") as output:
        reader = csv.DictReader(source)
        for row in reader:
            rows_seen += 1
            author = openalex_key(row.get("researcher_openalex_id"))
            if current_author and author != current_author:
                flush(output)
            current_author = author
            add_row(row)
            if rows_seen % 1_000_000 == 0:
                elapsed = max(1, time.time() - started)
                print(f"Rows {rows_seen:,}; researchers {researchers_written:,}; summaries {summaries_written:,}; {rows_seen / elapsed:,.0f} rows/s", flush=True)
        flush(output)

    print(json.dumps({
        "rows_seen": rows_seen,
        "researchers_written": researchers_written,
        "summaries_written": summaries_written,
        "seconds": round(time.time() - started, 1),
        "output": str(args.ndjson_out),
    }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
