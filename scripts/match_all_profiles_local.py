#!/usr/bin/env python3
import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

SOURCE_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_cleaned.csv")
AUTHORS_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_authors_export.csv")
OUTPUT_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_openalex.csv")
MATCHES_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_all_matches.csv")

KEEP_COLUMNS = [
    "url",
    "full_name",
    "email",
    "bio_about",
    "research",
    "position_name",
    "position",
    "affiliation",
    "faculty",
    "fields_of_research",
]


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def extract_orcid(row: dict) -> str:
    text = " ".join(str(row.get(k, "") or "") for k in ("bio_about", "research", "research_original"))
    found = re.findall(r"\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b", text)
    return found[0] if found else ""


def clean_orcid(value: str) -> str:
    value = value or ""
    return value.rstrip("/").rsplit("/", 1)[-1] if value else ""


def int_value(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def choose_best(candidates, input_orcid: str, full_name: str):
    if not candidates:
        return None, 0, ""
    wanted_name = normalize_name(full_name)
    wanted_orcid = clean_orcid(input_orcid)
    scored = []
    for cand in candidates:
        score = min(int_value(cand.get("works_count")), 200)
        reasons = []
        cand_orcids = {clean_orcid(cand.get("orcid")), clean_orcid(cand.get("ids_orcid"))}
        if wanted_orcid and wanted_orcid in cand_orcids:
            score += 1000
            reasons.append("orcid+imperial")
        if normalize_name(cand.get("display_name", "")) == wanted_name:
            score += 250
            if not reasons:
                reasons.append("exact_name+imperial")
        scored.append((score, int_value(cand.get("works_count")), int_value(cand.get("cited_by_count")), cand.get("openalex_id", ""), ",".join(reasons), cand))
    scored.sort(reverse=True)
    best = scored[0]
    return best[-1], best[0], best[-2]


def main() -> int:
    authors_by_name = defaultdict(list)
    authors_by_orcid = defaultdict(list)
    with AUTHORS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for author in reader:
            authors_by_name[normalize_name(author.get("display_name", ""))].append(author)
            for value in (author.get("orcid"), author.get("ids_orcid")):
                orcid = clean_orcid(value)
                if orcid:
                    authors_by_orcid[orcid].append(author)

    with SOURCE_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    output_columns = ["url", "full_name", "openalex_id", *KEEP_COLUMNS[2:]]
    match_columns = [
        "ord",
        "full_name",
        "openalex_id",
        "openalex_url",
        "openalex_display_name",
        "openalex_orcid",
        "works_count",
        "cited_by_count",
        "score",
        "match_reason",
    ]

    matched = 0
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as out_f, MATCHES_CSV.open("w", newline="", encoding="utf-8") as match_f:
        out_writer = csv.DictWriter(out_f, fieldnames=output_columns)
        match_writer = csv.DictWriter(match_f, fieldnames=match_columns)
        out_writer.writeheader()
        match_writer.writeheader()

        for idx, row in enumerate(rows, start=1):
            input_orcid = extract_orcid(row)
            candidates = []
            if input_orcid:
                candidates.extend(authors_by_orcid.get(input_orcid, []))
            candidates.extend(authors_by_name.get(normalize_name(row.get("full_name", "")), []))
            dedup = {cand.get("openalex_id"): cand for cand in candidates if cand.get("openalex_id")}
            best, score, reason = choose_best(list(dedup.values()), input_orcid, row.get("full_name", ""))

            openalex_id = best.get("openalex_id", "") if best else ""
            if openalex_id:
                matched += 1

            out = {col: row.get(col, "") for col in KEEP_COLUMNS}
            out["openalex_id"] = openalex_id
            out_writer.writerow({col: out.get(col, "") for col in output_columns})

            match_writer.writerow(
                {
                    "ord": idx,
                    "full_name": row.get("full_name", ""),
                    "openalex_id": openalex_id,
                    "openalex_url": best.get("openalex_url", "") if best else "",
                    "openalex_display_name": best.get("display_name", "") if best else "",
                    "openalex_orcid": best.get("orcid", "") or best.get("ids_orcid", "") if best else "",
                    "works_count": best.get("works_count", "") if best else "",
                    "cited_by_count": best.get("cited_by_count", "") if best else "",
                    "score": score if best else "",
                    "match_reason": reason,
                }
            )

    print(f"Wrote {OUTPUT_CSV}")
    print(f"Wrote {MATCHES_CSV}")
    print(f"Matched {matched} of {len(rows)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
