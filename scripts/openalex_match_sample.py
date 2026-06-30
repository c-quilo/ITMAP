#!/usr/bin/env python3
import csv
import gzip
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

CSV_PATH = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_cleaned.csv")
OUT_PATH = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_sample20.csv")
CANDIDATES_PATH = Path("/Users/caq13/Documents/ITMAP/openalex_imperial_sample20_candidates.jsonl")
MANIFEST_S3 = "s3://openalex-june-2026/openalex/data/authors/manifest"
MIRROR_PREFIX = "s3://openalex-june-2026/openalex"
SOURCE_PREFIX = "s3://openalex"
REGION = "us-east-1"
IMPERIAL_ID = "I47508984"
IMPERIAL_URL = "https://openalex.org/I47508984"


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def name_tokens(value: str) -> set[str]:
    return set(normalize_name(value).split())


def extract_orcids(row: dict) -> set[str]:
    text = " ".join(str(row.get(k, "") or "") for k in ("bio_about", "research", "research_original"))
    return set(re.findall(r"\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b", text))


def aws_cp_text(s3_uri: str) -> str:
    return subprocess.check_output(
        ["aws", "s3", "cp", s3_uri, "-", "--region", REGION],
        text=True,
    )


def stream_gzip_json_lines(s3_uri: str):
    proc = subprocess.Popen(
        ["aws", "s3", "cp", s3_uri, "-", "--region", REGION],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdout is not None
    try:
        with gzip.GzipFile(fileobj=proc.stdout) as gz:
            for raw in gz:
                yield raw
    finally:
        if proc.poll() is None:
            proc.kill()
        _, stderr = proc.communicate()
        if proc.returncode not in (0, None):
            raise RuntimeError(f"aws s3 cp failed for {s3_uri}: {stderr.decode('utf-8', 'replace')}")


def author_institution_ids(author: dict) -> set[str]:
    ids = set()
    for inst in author.get("last_known_institutions") or []:
        inst_id = inst.get("id") or ""
        ids.add(inst_id)
        ids.add(inst_id.rsplit("/", 1)[-1])
    for aff in author.get("affiliations") or []:
        for inst in aff.get("institutions") or []:
            inst_id = inst.get("id") or ""
            ids.add(inst_id)
            ids.add(inst_id.rsplit("/", 1)[-1])
    return ids


def author_orcids(author: dict) -> set[str]:
    ids = author.get("ids") or {}
    out = set()
    for key in ("orcid", "orcid_id"):
        val = ids.get(key)
        if val:
            out.add(str(val).rsplit("/", 1)[-1])
    return out


def score_candidate(row: dict, author: dict) -> tuple[int, list[str]]:
    reasons = []
    score = 0
    wanted_name = normalize_name(row["full_name"])
    got_name = normalize_name(author.get("display_name") or "")
    wanted_orcids = extract_orcids(row)
    got_orcids = author_orcids(author)

    if wanted_orcids and wanted_orcids & got_orcids:
        score += 1000
        reasons.append("orcid")
    if got_name == wanted_name:
        score += 250
        reasons.append("exact_name")
    else:
        wanted_tokens = name_tokens(row["full_name"])
        got_tokens = name_tokens(author.get("display_name") or "")
        if wanted_tokens and wanted_tokens <= got_tokens:
            score += 120
            reasons.append("name_tokens")
    if IMPERIAL_ID in author_institution_ids(author) or IMPERIAL_URL in author_institution_ids(author):
        score += 500
        reasons.append("imperial_affiliation")
    score += min(int(author.get("works_count") or 0), 200)
    return score, reasons


def compact_author(author: dict, row: dict, score: int, reasons: list[str]) -> dict:
    return {
        "input_name": row["full_name"],
        "input_url": row.get("url", ""),
        "openalex_id": (author.get("id") or "").rsplit("/", 1)[-1],
        "openalex_url": author.get("id") or "",
        "display_name": author.get("display_name") or "",
        "orcid": ",".join(sorted(author_orcids(author))),
        "works_count": author.get("works_count"),
        "cited_by_count": author.get("cited_by_count"),
        "institutions": [
            {"id": inst.get("id"), "display_name": inst.get("display_name")}
            for inst in (author.get("last_known_institutions") or [])
        ],
        "score": score,
        "reasons": reasons,
    }


def main() -> int:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    sample = rows[:20]

    lookup_names = {normalize_name(row["full_name"]): i for i, row in enumerate(sample)}
    lookup_orcids = {}
    for i, row in enumerate(sample):
        for orcid in extract_orcids(row):
            lookup_orcids[orcid] = i
    byte_needles = []
    for row in sample:
        if row["full_name"]:
            byte_needles.append(row["full_name"].encode("utf-8"))
    for orcid in lookup_orcids:
        byte_needles.append(orcid.encode("utf-8"))

    manifest = json.loads(aws_cp_text(MANIFEST_S3))
    entries = manifest["entries"]
    best: dict[int, tuple[int, dict]] = {}
    all_candidates = []
    started = time.time()

    print(f"Scanning {len(entries)} author gzip files for {len(sample)} sample researchers...", flush=True)
    for idx, entry in enumerate(entries, start=1):
        s3_uri = entry["url"].replace(SOURCE_PREFIX, MIRROR_PREFIX, 1)
        found_in_file = 0
        for raw in stream_gzip_json_lines(s3_uri):
            if not any(needle in raw for needle in byte_needles):
                continue
            text = raw.decode("utf-8", "replace")
            try:
                author = json.loads(text)
            except json.JSONDecodeError:
                continue

            matches = set()
            author_name = normalize_name(author.get("display_name") or "")
            if author_name in lookup_names:
                matches.add(lookup_names[author_name])
            for orcid in author_orcids(author):
                if orcid in lookup_orcids:
                    matches.add(lookup_orcids[orcid])
            if not matches:
                continue

            for sample_index in matches:
                score, reasons = score_candidate(sample[sample_index], author)
                if "imperial_affiliation" not in reasons and "orcid" not in reasons:
                    continue
                candidate = compact_author(author, sample[sample_index], score, reasons)
                all_candidates.append(candidate)
                if sample_index not in best or score > best[sample_index][0]:
                    best[sample_index] = (score, candidate)
                found_in_file += 1

        if idx % 25 == 0 or found_in_file:
            elapsed = max(time.time() - started, 1)
            print(f"{idx}/{len(entries)} files scanned; candidates={len(all_candidates)}; elapsed={elapsed/60:.1f}m", flush=True)
        if len(best) == len(sample):
            print("Found a best candidate for every sample row; continuing one extra pass is skipped for pilot speed.", flush=True)
            break

    with CANDIDATES_PATH.open("w", encoding="utf-8") as f:
        for cand in all_candidates:
            f.write(json.dumps(cand, ensure_ascii=False) + "\n")

    fieldnames = list(rows[0].keys())
    full_name_index = fieldnames.index("full_name")
    out_fieldnames = fieldnames[: full_name_index + 1] + ["openalex_id"] + fieldnames[full_name_index + 1 :]
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fieldnames)
        writer.writeheader()
        for i, row in enumerate(sample):
            out = dict(row)
            out["openalex_id"] = best.get(i, (None, {"openalex_id": ""}))[1]["openalex_id"]
            writer.writerow(out)

    print(f"Wrote {OUT_PATH}")
    print(f"Wrote candidate audit {CANDIDATES_PATH}")
    for i, row in enumerate(sample):
        cand = best.get(i, (None, None))[1]
        print(f"{i+1:02d}. {row['full_name']} -> {cand['openalex_id'] if cand else ''} {cand['reasons'] if cand else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
