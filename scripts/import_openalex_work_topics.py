#!/usr/bin/env python3
"""Build a compact OpenAlex work-to-topic COPY file from the Athena paper export."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from import_openalex_researcher_topics import load_topic_dictionary, split_known_topics


DEFAULT_PAPERS = Path("researcher_papers_full_snapshot_all_authors_athena.csv")
DEFAULT_TOPICS = Path(".tmp/openalex-topics")
DEFAULT_OUTPUT = Path(".tmp/openalex_work_topics_copy.csv")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--papers-csv", type=Path, default=DEFAULT_PAPERS)
    parser.add_argument("--topics-dir", type=Path, default=DEFAULT_TOPICS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def postgres_text_array(values: list[str]) -> str:
    escaped = [f'"{value.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"' for value in values]
    return "{" + ",".join(escaped) + "}"


def main() -> int:
    args = parse_args()
    _, topics_by_name = load_topic_dictionary(args.topics_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    seen_work_ids: set[str] = set()
    written = 0
    without_topics = 0
    unparsed = 0

    with args.papers_csv.open(newline="", encoding="utf-8") as source, args.output.open(
        "w", newline="", encoding="utf-8"
    ) as destination:
        reader = csv.DictReader(source)
        writer = csv.writer(destination)
        writer.writerow(["openalex_work_id", "topics"])

        for row in reader:
            work_id = (row.get("openalex_work_id") or "").strip()
            if not work_id or work_id in seen_work_ids:
                continue
            seen_work_ids.add(work_id)

            raw_topics = (row.get("topics") or "").strip()
            topics = split_known_topics(raw_topics, topics_by_name) if raw_topics else []
            if raw_topics and not topics:
                unparsed += 1
            if not topics:
                without_topics += 1
            writer.writerow([work_id, postgres_text_array([topic.display_name for topic in topics])])
            written += 1

    print(f"Wrote {written:,} unique works to {args.output}")
    print(f"Works without topics: {without_topics:,}")
    print(f"Unparsed topic lists: {unparsed:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
