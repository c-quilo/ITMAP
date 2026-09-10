#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_OVERRIDES = Path(__file__).with_name("openalex_author_overrides.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Filter a post-snapshot OpenAlex export before import.")
    parser.add_argument("--csv-in", type=Path, required=True)
    parser.add_argument("--csv-out", type=Path, required=True)
    parser.add_argument("--skipped-out", type=Path, required=True)
    parser.add_argument("--author-input", type=Path, required=True)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--min-publication-year", type=int, default=2026)
    parser.add_argument("--max-incremental-author-rows", type=int, default=1000)
    return parser.parse_args()


def load_author_names(path: Path) -> dict[str, list[str]]:
    names: dict[str, set[str]] = defaultdict(set)
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("openalex_id") and row.get("full_name"):
                names[row["openalex_id"]].add(row["full_name"])
    return {key: sorted(values) for key, values in names.items()}


def load_override_rules(path: Path) -> tuple[set[str], set[str]]:
    if not path.exists():
        return set(), set()
    overrides = json.loads(path.read_text(encoding="utf-8"))
    trusted_sources: set[str] = set()
    disallowed_aliases: set[str] = set()
    for override in overrides.values():
        sources = set(override.get("paper_source_ids") or [])
        identities = set(override.get("identity_aliases") or [])
        trusted_sources.update(sources)
        disallowed_aliases.update(identities - sources)
    return trusted_sources, disallowed_aliases


def main() -> int:
    args = parse_args()
    author_names = load_author_names(args.author_input)
    trusted_sources, disallowed_aliases = load_override_rules(args.overrides)
    total_counts: Counter[str] = Counter()
    eligible_counts: Counter[str] = Counter()

    with args.csv_in.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            author_id = row.get("researcher_openalex_id", "")
            total_counts[author_id] += 1
            year = row.get("publication_year", "")
            if year.isdigit() and int(year) >= args.min_publication_year:
                eligible_counts[author_id] += 1

    unsafe_volume = {
        author_id
        for author_id, count in total_counts.items()
        if count > args.max_incremental_author_rows and author_id not in trusted_sources
    }
    excluded = disallowed_aliases | unsafe_volume

    written = 0
    seen_pairs: set[tuple[str, str]] = set()
    with args.csv_in.open(newline="", encoding="utf-8") as source, args.csv_out.open(
        "w", newline="", encoding="utf-8"
    ) as destination:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(destination, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            author_id = row.get("researcher_openalex_id", "")
            work_id = row.get("openalex_work_id", "")
            year = row.get("publication_year", "")
            if author_id in excluded or not year.isdigit() or int(year) < args.min_publication_year:
                continue
            key = (author_id, work_id)
            if not all(key) or key in seen_pairs:
                continue
            seen_pairs.add(key)
            writer.writerow(row)
            written += 1

    with args.skipped_out.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["openalex_id", "researcher_names", "incremental_rows", "eligible_rows", "reason"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for author_id in sorted(excluded, key=lambda value: total_counts[value], reverse=True):
            reasons = []
            if author_id in disallowed_aliases:
                reasons.append("curated identity alias is not an approved paper source")
            if author_id in unsafe_volume:
                reasons.append("suspicious incremental paper volume")
            writer.writerow({
                "openalex_id": author_id,
                "researcher_names": "; ".join(author_names.get(author_id, [])),
                "incremental_rows": total_counts[author_id],
                "eligible_rows": eligible_counts[author_id],
                "reason": "; ".join(reasons),
            })

    print(f"Incremental rows: {sum(total_counts.values()):,}")
    print(f"Eligible rows before safeguards: {sum(eligible_counts.values()):,}")
    print(f"Excluded author IDs: {len(excluded):,}")
    print(f"Rows written: {written:,}")
    print(f"Filtered CSV: {args.csv_out}")
    print(f"Audit CSV: {args.skipped_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
