#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_PAPERS_CSV = Path("researcher_papers_full_snapshot_all_authors_athena.csv")
DEFAULT_TOPICS_DIR = Path(".tmp/openalex-topics")
DEFAULT_OUTPUT = Path(".tmp/researcher_openalex_topics.jsonl")
DEFAULT_PILOT_NAMES = (
    "Anthony Bull",
    "Iain McNeish",
    "Marisa Miraldo",
    "Faith Osier",
    "Payam Barnaghi",
    "Will Branford",
    "Aldo Faisal",
    "Alessandra Russo",
    "Jonathan Eastwood",
    "Kin Leung",
    "Julie McCann",
    "Matthew Santer",
    "Benjamin Barratt",
    "Alyssa Gilbert",
    "Mirabelle Muuls",
    "Nilay Shah",
    "Cesar Quilodran Casas",
)
TOPIC_RANK_WEIGHTS = (0.45, 0.25, 0.15, 0.1, 0.05)
TOP_RESEARCHER_TOPICS = 12
TOP_EVIDENCE_PAPERS = 5
MIN_PUBLICATION_YEAR = 1970
RECENT_YEARS = 5
PRIOR_YEARS = 10
SUPABASE_BATCH_SIZE = 400
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""


@dataclass(frozen=True)
class Topic:
    openalex_id: str
    display_name: str
    description: str
    keywords: tuple[str, ...]
    domain_name: str
    field_name: str
    subfield_name: str
    works_count: int


@dataclass
class TopicAggregate:
    topic: Topic
    paper_count: int = 0
    weight: float = 0.0
    first_year: int | None = None
    latest_year: int | None = None
    recent_paper_count: int = 0
    recent_weight: float = 0.0
    prior_weight: float = 0.0
    year_counts: dict[int, int] = field(default_factory=dict)
    evidence: list[dict] = field(default_factory=list)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build cached researcher themes from OpenAlex Topics already present in the Athena paper export.",
    )
    parser.add_argument("--papers-csv", type=Path, default=DEFAULT_PAPERS_CSV)
    parser.add_argument("--topics-dir", type=Path, default=DEFAULT_TOPICS_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--top-topics", type=int, default=TOP_RESEARCHER_TOPICS)
    parser.add_argument("--all", action="store_true", help="Process every researcher instead of the co-director pilot.")
    parser.add_argument("--name", action="append", default=[], help="Process a named researcher; may be repeated.")
    parser.add_argument("--openalex-id", action="append", default=[], help="Process an OpenAlex author ID; may be repeated.")
    parser.add_argument("--write", action="store_true", help="Upsert generated themes into Supabase.")
    return parser.parse_args()


def require_supabase_url() -> str:
    value = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not value:
        raise SystemExit("Missing SUPABASE_URL or VITE_SUPABASE_URL")
    return value.rstrip("/")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value.rstrip("/")


def request_json(url: str, method: str = "GET", body=None, headers=None, timeout=180):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    if body is not None:
        request.add_header("Content-Type", "application/json")

    for attempt in range(1, 6):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
        except (ConnectionError, OSError, TimeoutError, socket.timeout, urllib.error.URLError) as error:
            if attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
        wait = min(30, 2**attempt)
        print(f"Retrying request in {wait}s (attempt {attempt}/5)", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"{method} {url} failed after retries")


def supabase_headers(prefer: str | None = None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def normalise_openalex_id(value: str) -> str:
    cleaned = str(value or "").strip().upper().rstrip("/")
    return cleaned.rsplit("/", 1)[-1]


def normalise_name(value: str) -> str:
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = "".join(character for character in decomposed if not unicodedata.combining(character))
    return " ".join("".join(character if character.isalnum() else " " for character in ascii_name.lower()).split())


def compact(value) -> str:
    return " ".join(str(value or "").split())


def nested_name(value) -> str:
    return compact(value.get("display_name")) if isinstance(value, dict) else ""


def load_topic_dictionary(topics_dir: Path) -> tuple[dict[str, Topic], dict[str, Topic]]:
    topics_by_id: dict[str, Topic] = {}
    topic_candidates_by_name: dict[str, list[Topic]] = defaultdict(list)
    files = sorted(topics_dir.rglob("*.gz"))
    if not files:
        raise SystemExit(f"No OpenAlex topic files found under {topics_dir}")

    for path in files:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                raw = json.loads(line)
                openalex_id = normalise_openalex_id(raw.get("id", ""))
                display_name = compact(raw.get("display_name"))
                if not openalex_id or not display_name:
                    continue
                topic = Topic(
                    openalex_id=openalex_id,
                    display_name=display_name,
                    description=compact(raw.get("description")),
                    keywords=tuple(compact(item) for item in (raw.get("keywords") or []) if compact(item))[:12],
                    domain_name=nested_name(raw.get("domain")),
                    field_name=nested_name(raw.get("field")),
                    subfield_name=nested_name(raw.get("subfield")),
                    works_count=int(raw.get("works_count") or 0),
                )
                topics_by_id[openalex_id] = topic

    for topic in topics_by_id.values():
        topic_candidates_by_name[topic.display_name].append(topic)

    topics_by_name = {
        name: max(candidates, key=lambda item: (item.works_count, item.openalex_id))
        for name, candidates in topic_candidates_by_name.items()
    }
    return topics_by_id, topics_by_name


def split_known_topics(value: str, topics_by_name: dict[str, Topic]) -> list[Topic]:
    text = compact(value)
    if not text or text == "[]":
        return []
    inner = text[1:-1].strip() if text.startswith("[") and text.endswith("]") else text
    parts = inner.split(", ")

    # OpenAlex exports an unquoted display-name array. Try every partition into at most
    # five groups so commas inside an official topic name remain intact.
    for topic_count in range(min(5, len(parts)), 0, -1):
        boundaries: list[tuple[int, ...]] = []

        def choose(start: int, remaining: int, selected: tuple[int, ...]):
            if remaining == 0:
                boundaries.append(selected)
                return
            for index in range(start, len(parts)):
                choose(index + 1, remaining - 1, selected + (index,))

        choose(1, topic_count - 1, ())
        for selected in boundaries:
            stops = (0,) + selected + (len(parts),)
            names = [", ".join(parts[stops[index]:stops[index + 1]]) for index in range(topic_count)]
            if all(name in topics_by_name for name in names):
                return [topics_by_name[name] for name in names]
    return []


def load_researchers() -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        params = {
            "select": "id,full_name,openalex_id,profile_url,position_name,position,affiliation,faculty",
            "limit": "1000",
            "offset": str(offset),
        }
        batch = request_json(
            f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}",
            headers=supabase_headers(),
        ) or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


def choose_researchers(researchers: list[dict], args) -> tuple[dict[str, list[dict]], list[dict]]:
    named = list(args.name)
    if not args.all and not named and not args.openalex_id:
        named = list(DEFAULT_PILOT_NAMES)

    requested_names = {normalise_name(name) for name in named}
    requested_ids = {normalise_openalex_id(value) for value in args.openalex_id}
    selected: list[dict] = []
    for researcher in researchers:
        openalex_id = normalise_openalex_id(researcher.get("openalex_id", ""))
        name = normalise_name(researcher.get("full_name", ""))
        if args.all or openalex_id in requested_ids or name in requested_names:
            if openalex_id.startswith("A"):
                selected.append(researcher)

    if named:
        matched_names = {normalise_name(row.get("full_name", "")) for row in selected}
        missing = sorted(requested_names - matched_names)
        if missing:
            print(f"Warning: no exact researcher profile match for {', '.join(missing)}", flush=True)

    by_openalex: dict[str, list[dict]] = defaultdict(list)
    for researcher in selected:
        by_openalex[normalise_openalex_id(researcher["openalex_id"])].append(researcher)
    return dict(by_openalex), selected


def rank_weights(topic_count: int) -> list[float]:
    weights = list(TOPIC_RANK_WEIGHTS[:topic_count])
    total = sum(weights)
    return [weight / total for weight in weights] if total else []


def evidence_sort_key(item: dict):
    return (
        float(item.get("topic_weight") or 0),
        int(item.get("year") or 0),
        int(item.get("citations") or 0),
        str(item.get("title") or ""),
    )


def theme_trend(aggregate: TopicAggregate) -> str:
    if aggregate.paper_count < 3:
        return "insufficient_data"
    if aggregate.recent_weight >= max(1.5, aggregate.prior_weight * 1.25):
        return "emerging"
    if aggregate.prior_weight >= 1.5 and aggregate.recent_weight <= aggregate.prior_weight * 0.65:
        return "declining"
    return "stable"


def build_theme_rows(
    openalex_id: str,
    profiles: list[dict],
    total_papers: int,
    aggregates: dict[str, TopicAggregate],
    top_topics: int,
    parse_rate: float,
) -> list[dict]:
    if total_papers <= 0:
        return []
    ranked = sorted(
        aggregates.values(),
        key=lambda item: (
            item.weight / total_papers,
            item.recent_weight,
            item.paper_count,
            item.topic.display_name,
        ),
        reverse=True,
    )[:max(1, min(top_topics, 24))]
    source_digest = hashlib.sha256(
        json.dumps(
            [
                (
                    item.topic.openalex_id,
                    round(item.weight, 8),
                    item.paper_count,
                    item.latest_year,
                    sorted(item.year_counts.items()),
                )
                for item in ranked
            ],
            separators=(",", ":"),
        ).encode("utf-8"),
    ).hexdigest()
    generated_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []

    for profile in profiles:
        for aggregate in ranked:
            topic = aggregate.topic
            evidence = sorted(aggregate.evidence, key=evidence_sort_key, reverse=True)[:TOP_EVIDENCE_PAPERS]
            rows.append({
                "researcher_id": profile["id"],
                "theme_key": f"openalex:{topic.openalex_id}",
                "source_type": "openalex_topic",
                "openalex_topic_id": topic.openalex_id,
                "label": topic.display_name,
                "description": topic.description,
                "keywords": list(topic.keywords),
                "domain_name": topic.domain_name or None,
                "field_name": topic.field_name or None,
                "subfield_name": topic.subfield_name or None,
                "topic_strength": round(aggregate.weight / total_papers, 8),
                "paper_share": round(aggregate.paper_count / total_papers, 8),
                "paper_count": aggregate.paper_count,
                "first_year": aggregate.first_year,
                "latest_year": aggregate.latest_year,
                "recent_paper_count": aggregate.recent_paper_count,
                "trend": theme_trend(aggregate),
                "confidence": round(min(0.99, 0.72 + 0.04 * math.log1p(aggregate.paper_count)) * parse_rate, 4),
                "evidence": {
                    "papers": evidence,
                    "topic_rank_weight": "0.45/0.25/0.15/0.10/0.05 normalized by topics present",
                    "source": "OpenAlex Topics snapshot",
                    "author_openalex_id": openalex_id,
                    "total_author_papers": total_papers,
                    "year_counts": {str(year): count for year, count in sorted(aggregate.year_counts.items())},
                },
                "source_hash": source_digest,
                "clustering_version": "openalex-topics-2026-03-rank-weight-v1",
                "embedding_model": "openalex-topics-2026-03",
                "generated_at": generated_at,
                "updated_at": generated_at,
            })
    return rows


def iter_theme_rows(
    papers_csv: Path,
    researchers_by_openalex: dict[str, list[dict]],
    topics_by_name: dict[str, Topic],
    top_topics: int,
) -> Iterable[dict]:
    allowed_ids = set(researchers_by_openalex)
    current_author = ""
    total_papers = 0
    parsed_papers = 0
    aggregates: dict[str, TopicAggregate] = {}
    current_year = datetime.now(timezone.utc).year
    rows_seen = 0

    def flush():
        if not current_author:
            return []
        parse_rate = parsed_papers / total_papers if total_papers else 0.0
        return build_theme_rows(
            current_author,
            researchers_by_openalex[current_author],
            total_papers,
            aggregates,
            top_topics,
            parse_rate,
        )

    csv.field_size_limit(sys.maxsize)
    with papers_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            rows_seen += 1
            author_id = normalise_openalex_id(raw.get("researcher_openalex_id", ""))
            if author_id not in allowed_ids:
                continue
            if current_author and author_id != current_author:
                yield from flush()
                total_papers = 0
                parsed_papers = 0
                aggregates = {}
            current_author = author_id
            year = int(raw.get("publication_year") or 0)
            if year and year < MIN_PUBLICATION_YEAR:
                continue
            total_papers += 1
            topics = split_known_topics(raw.get("topics", ""), topics_by_name)
            if not topics:
                continue
            parsed_papers += 1
            weights = rank_weights(len(topics))
            for topic, weight in zip(topics, weights):
                aggregate = aggregates.setdefault(topic.openalex_id, TopicAggregate(topic=topic))
                aggregate.paper_count += 1
                aggregate.weight += weight
                if year:
                    aggregate.first_year = year if aggregate.first_year is None else min(aggregate.first_year, year)
                    aggregate.latest_year = year if aggregate.latest_year is None else max(aggregate.latest_year, year)
                    aggregate.year_counts[year] = aggregate.year_counts.get(year, 0) + 1
                if year >= current_year - RECENT_YEARS:
                    aggregate.recent_paper_count += 1
                    aggregate.recent_weight += weight
                elif year >= current_year - PRIOR_YEARS:
                    aggregate.prior_weight += weight
                aggregate.evidence.append({
                    "openalex_work_id": normalise_openalex_id(raw.get("openalex_work_id", "")),
                    "title": compact(raw.get("title")),
                    "year": year or None,
                    "citations": int(raw.get("cited_by_count") or 0),
                    "doi": compact(raw.get("doi")) or None,
                    "topic_weight": round(weight, 6),
                })
            if rows_seen % 100_000 == 0:
                print(f"Scanned {rows_seen:,} paper rows...", flush=True)

    yield from flush()
    print(f"Finished scanning {rows_seen:,} paper rows.", flush=True)


def chunks(items: list[dict], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def upsert_rows(rows: list[dict]) -> int:
    uploaded = 0
    for batch in chunks(rows, SUPABASE_BATCH_SIZE):
        result = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_themes?on_conflict=researcher_id,theme_key",
            method="POST",
            body=batch,
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
        )
        uploaded += len(result or [])
    return uploaded


def main():
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    args = parse_args()
    if not args.papers_csv.exists():
        raise SystemExit(f"Paper export not found: {args.papers_csv}")

    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    print("Loading the OpenAlex Topic dictionary...", flush=True)
    topics_by_id, topics_by_name = load_topic_dictionary(args.topics_dir)
    print(f"Loaded {len(topics_by_id):,} official topics.", flush=True)

    researchers = load_researchers()
    researchers_by_openalex, selected = choose_researchers(researchers, args)
    if not researchers_by_openalex:
        raise SystemExit("No matching researchers with OpenAlex IDs were found.")
    print(
        f"Building themes for {len(selected):,} profiles across {len(researchers_by_openalex):,} OpenAlex author IDs.",
        flush=True,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    with args.output.open("w", encoding="utf-8") as output:
        for row in iter_theme_rows(args.papers_csv, researchers_by_openalex, topics_by_name, args.top_topics):
            output.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            rows.append(row)

    covered = {row["researcher_id"] for row in rows}
    missing_profiles = [row["full_name"] for row in selected if row["id"] not in covered]
    print(f"Generated {len(rows):,} theme rows for {len(covered):,} profiles.", flush=True)
    if missing_profiles:
        print(f"No topic-bearing paper rows found for: {', '.join(sorted(missing_profiles))}", flush=True)
    print(f"Saved cache preview to {args.output}", flush=True)

    if args.write and rows:
        uploaded = upsert_rows(rows)
        print(f"Upserted {uploaded:,} theme rows into Supabase.", flush=True)
    elif not args.write:
        print("Dry run complete. Add --write after the migration is applied.", flush=True)


if __name__ == "__main__":
    main()
