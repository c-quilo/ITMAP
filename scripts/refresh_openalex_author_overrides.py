#!/usr/bin/env python3
from __future__ import annotations

"""Atomically rebuild manually verified researcher datasets from OpenAlex.

The override file is intentionally conservative. Author records are combined only
after manual verification, while individual work IDs can be used for names that
OpenAlex has conflated with unrelated people.
"""

import argparse
import hashlib
import html
import json
import math
import os
import re
import socket
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_CONFIG = Path("scripts/openalex_author_overrides.json")
DEFAULT_BACKUP_DIR = Path(".tmp/openalex-override-backups")
EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
PAPER_EMBEDDING_CHARS = 8000
PROFILE_EMBEDDING_CHARS = 28000
OPENALEX_PER_PAGE = 200
MIN_PUBLICATION_YEAR = 1970
TOP_RESEARCHER_TOPICS = 12
TOP_EVIDENCE_PAPERS = 5
TOPIC_RANK_WEIGHTS = (0.45, 0.25, 0.15, 0.10, 0.05)
CURRENT_YEAR = datetime.now(timezone.utc).year
PREPRINT_SOURCE_PATTERN = re.compile(
    r"arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints\.org|osf preprints|eartharxiv|engrxiv",
    re.IGNORECASE,
)
GENERIC_PUBLICATION_TITLE_PATTERN = re.compile(
    r"^(issue information|contents?|contents list|table of contents|front matter|back matter|editorial board|"
    r"information for authors|publication information|masthead|editors? choice|preface|foreword|introduction|"
    r"index|abstracts?)$|(?:publication information|information for authors)$",
    re.IGNORECASE,
)


SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
OPENAI_API_KEY = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument(
        "--researcher-id",
        action="append",
        default=[],
        help="Only rebuild this researcher UUID; may be repeated.",
    )
    parser.add_argument("--name", action="append", default=[], help="Only rebuild this exact configured name.")
    parser.add_argument("--all", action="store_true", help="Rebuild every entry in the override file.")
    parser.add_argument("--write", action="store_true", help="Write the prepared replacement to Supabase.")
    parser.add_argument("--skip-embeddings", action="store_true", help="Prepare null embeddings for diagnostics only.")
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    parser.add_argument("--sleep", type=float, default=0.08)
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value.rstrip("/")


def require_supabase_url() -> str:
    value = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not value:
        raise SystemExit("Missing SUPABASE_URL or VITE_SUPABASE_URL")
    return value.rstrip("/")


def request_json(url: str, method: str = "GET", body=None, headers=None, timeout: int = 240):
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8") if body is not None else None
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
            if error.code not in {408, 429, 500, 502, 503, 504} or attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
        except (ConnectionError, OSError, TimeoutError, socket.timeout, urllib.error.URLError) as error:
            if attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
        wait = min(45, 2**attempt)
        print(f"  retrying request in {wait}s ({attempt}/5)", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"{method} {url} failed after retries")


def supabase_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def compact(value) -> str:
    return " ".join(str(value or "").split())


def clean_openalex_text(value) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(
        r"\s*<(?:sub|sup)[^>]*>(.*?)</(?:sub|sup)>",
        lambda match: re.sub(r"<[^>]+>", "", match.group(1)),
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return compact(re.sub(r"<[^>]+>", "", text))


def short_openalex_id(value: str) -> str:
    return compact(value).rstrip("/").rsplit("/", 1)[-1].upper()


def normalized_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = "".join(character for character in decomposed if not unicodedata.combining(character))
    return " ".join(
        "".join(character if character.isalnum() else " " for character in ascii_name.casefold()).split()
    )


def normalized_group(value: str) -> str:
    result = normalized_name(value)
    return "grantham institute for climate change" if result == "institute for climate change" else result


def chunks(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def restore_abstract(inverted_index) -> str:
    if not isinstance(inverted_index, dict):
        return ""
    positioned_words: list[tuple[int, str]] = []
    for word, positions in inverted_index.items():
        if not isinstance(positions, list):
            continue
        for position in positions:
            try:
                positioned_words.append((int(position), word))
            except (TypeError, ValueError):
                continue
    return compact(" ".join(word for _, word in sorted(positioned_words)))


def fetch_openalex_author_works(author_id: str, sleep_seconds: float) -> list[dict]:
    works: list[dict] = []
    cursor = "*"
    while cursor:
        params = {
            "filter": f"authorships.author.id:{short_openalex_id(author_id)}",
            "per-page": str(OPENALEX_PER_PAGE),
            "cursor": cursor,
        }
        if os.environ.get("OPENALEX_MAILTO"):
            params["mailto"] = os.environ["OPENALEX_MAILTO"]
        payload = request_json(f"https://api.openalex.org/works?{urllib.parse.urlencode(params)}") or {}
        page = payload.get("results") or []
        works.extend(page)
        cursor = (payload.get("meta") or {}).get("next_cursor") if page else None
        if cursor:
            time.sleep(sleep_seconds)
    print(f"  {short_openalex_id(author_id)}: {len(works):,} works", flush=True)
    return works


def fetch_openalex_work(work_id: str) -> dict:
    params = {}
    if os.environ.get("OPENALEX_MAILTO"):
        params["mailto"] = os.environ["OPENALEX_MAILTO"]
    suffix = f"?{urllib.parse.urlencode(params)}" if params else ""
    return request_json(f"https://api.openalex.org/works/{short_openalex_id(work_id)}{suffix}") or {}


def load_paged_table(table: str, select: str, filters: dict[str, str] | None = None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        params = {"select": select, "limit": "1000", "offset": str(offset), **(filters or {})}
        page = request_json(
            f"{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(params)}",
            headers=supabase_headers(),
        ) or []
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += 1000


def load_researcher(researcher_id: str) -> dict:
    fields = (
        "id,profile_url,full_name,openalex_id,email,bio_about,research,position_name,position,"
        "affiliation,faculty,fields_of_research"
    )
    params = {"select": fields, "id": f"eq.{researcher_id}", "limit": "1"}
    rows = request_json(
        f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}",
        headers=supabase_headers(),
    ) or []
    if not rows:
        raise RuntimeError(f"Researcher {researcher_id} was not found in Supabase")
    return rows[0]


def load_identity_directory() -> tuple[dict[str, dict], dict[str, dict]]:
    researchers = load_paged_table(
        "researchers",
        "id,full_name,openalex_id,affiliation,faculty,profile_url",
    )
    profiles_by_id = {row["id"]: row for row in researchers}
    candidates: dict[str, list[dict]] = defaultdict(list)
    for profile in researchers:
        openalex_id = short_openalex_id(profile.get("openalex_id", ""))
        if openalex_id.startswith("A"):
            candidates[openalex_id].append(profile)

    aliases = load_paged_table("researcher_openalex_aliases", "researcher_id,openalex_id,confidence")
    for alias in aliases:
        profile = profiles_by_id.get(alias.get("researcher_id"))
        openalex_id = short_openalex_id(alias.get("openalex_id", ""))
        if profile and openalex_id.startswith("A") and profile not in candidates[openalex_id]:
            candidates[openalex_id].append(profile)

    profiles_by_openalex = {
        openalex_id: profiles[0]
        for openalex_id, profiles in candidates.items()
        if len({profile["id"] for profile in profiles}) == 1
    }
    return profiles_by_id, profiles_by_openalex


def fetch_existing_backup(researcher: dict) -> dict:
    researcher_id = researcher["id"]
    papers = load_paged_table(
        "researcher_papers",
        "id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi",
        {"researcher_id": f"eq.{researcher_id}"},
    )
    coauthors = load_paged_table(
        "researcher_coauthors",
        "coauthor_openalex_id,coauthor_name,shared_papers,institution_names,latest_year,total_citations,paper_titles",
        {"researcher_id": f"eq.{researcher_id}"},
    )
    themes = load_paged_table(
        "researcher_themes",
        "theme_key,openalex_topic_id,label,paper_count,latest_year,trend,evidence",
        {"researcher_id": f"eq.{researcher_id}"},
    )
    return {
        "backed_up_at": datetime.now(timezone.utc).isoformat(),
        "researcher": researcher,
        "papers": papers,
        "coauthors": coauthors,
        "themes": themes,
    }


def work_source_name(work: dict) -> str:
    location = work.get("primary_location") or {}
    source = location.get("source") or {}
    return compact(source.get("display_name") or location.get("raw_source_name"))


def normalized_publication_title(value) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    ascii_title = "".join(character for character in decomposed if not unicodedata.combining(character))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_title.casefold()).split())


def normalized_publication_doi(value) -> str:
    return re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", compact(value).casefold()).strip()


def is_substantive_publication_title(value: str) -> bool:
    return len(value) >= 24 and len(value.split()) >= 5 and not GENERIC_PUBLICATION_TITLE_PATTERN.search(value)


def is_preprint_work(work: dict) -> bool:
    return bool(
        PREPRINT_SOURCE_PATTERN.search(work_source_name(work))
        or PREPRINT_SOURCE_PATTERN.search(normalized_publication_doi(work.get("doi")))
    )


def publication_title_token_similarity(first: str, second: str) -> float:
    first_tokens = set(first.split())
    second_tokens = set(second.split())
    if len(first_tokens) < 5 or len(second_tokens) < 5:
        return 0
    overlap = len(first_tokens & second_tokens)
    union = len(first_tokens | second_tokens)
    return min(overlap / union if union else 0, overlap / min(len(first_tokens), len(second_tokens)))


def publication_version(work: dict) -> dict:
    work_id = short_openalex_id(work.get("id", ""))
    doi = compact(work.get("doi"))
    source = work_source_name(work)
    preprint = is_preprint_work(work)
    doi_url = doi if doi.startswith("http") else f"https://doi.org/{normalized_publication_doi(doi)}" if doi else ""
    return {
        "label": source or ("Preprint" if preprint else "Published version" if doi else "OpenAlex record"),
        "kind": "preprint" if preprint else "published" if doi else "repository",
        "url": doi_url or (f"https://openalex.org/{work_id}" if work_id else ""),
        "openalex_url": f"https://openalex.org/{work_id}" if work_id else "",
        "openalex_work_id": work_id,
        "doi": doi or None,
        "publication_year": int(work.get("publication_year") or 0) or None,
    }


def canonicalize_works(works: list[dict]) -> list[dict]:
    if len(works) < 2:
        result = []
        for work in works:
            canonical = dict(work)
            canonical["_canonical_abstract"] = restore_abstract(work.get("abstract_inverted_index"))
            canonical["_canonical_versions"] = [publication_version(work)]
            canonical["_canonical_work_ids"] = [short_openalex_id(work.get("id", ""))]
            result.append(canonical)
        return result

    entries = []
    for index, work in enumerate(works):
        entries.append({
            "index": index,
            "work": work,
            "title": normalized_publication_title(work.get("display_name") or work.get("title")),
            "doi": normalized_publication_doi(work.get("doi")),
            "year": int(work.get("publication_year") or 0),
            "is_preprint": is_preprint_work(work),
        })
    parent = list(range(len(entries)))

    def find(value: int) -> int:
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parent[second_root] = first_root

    by_title: dict[str, list[dict]] = defaultdict(list)
    for entry in entries:
        if not is_substantive_publication_title(entry["title"]):
            continue
        for match in by_title[entry["title"]]:
            close_in_time = not entry["year"] or not match["year"] or abs(entry["year"] - match["year"]) <= 3
            same_doi = bool(entry["doi"] and match["doi"] and entry["doi"] == match["doi"])
            missing_identifier = not entry["doi"] or not match["doi"]
            if same_doi or (close_in_time and (entry["is_preprint"] or match["is_preprint"] or missing_identifier)):
                union(entry["index"], match["index"])
        by_title[entry["title"]].append(entry)

    preprints = [entry for entry in entries if entry["is_preprint"] and is_substantive_publication_title(entry["title"])]
    publications = [entry for entry in entries if not entry["is_preprint"] and is_substantive_publication_title(entry["title"])]
    for preprint in preprints:
        for publication in publications:
            if find(preprint["index"]) == find(publication["index"]):
                continue
            if preprint["year"] and publication["year"] and abs(preprint["year"] - publication["year"]) > 3:
                continue
            length_ratio = min(len(preprint["title"]), len(publication["title"])) / max(
                len(preprint["title"]), len(publication["title"])
            )
            if length_ratio >= 0.8 and publication_title_token_similarity(preprint["title"], publication["title"]) >= 0.82:
                union(preprint["index"], publication["index"])

    groups: dict[int, list[dict]] = defaultdict(list)
    for entry in entries:
        groups[find(entry["index"])].append(entry["work"])

    canonical_works = []
    for group in groups.values():
        def rank(work: dict):
            preprint = is_preprint_work(work)
            has_doi = bool(normalized_publication_doi(work.get("doi")))
            source_rank = 0 if not preprint and has_doi else 1 if not preprint else 2 if has_doi else 3
            return (
                source_rank,
                -int(work.get("publication_year") or 0),
                -int(work.get("cited_by_count") or 0),
            )

        representative = min(group, key=rank)
        canonical = dict(representative)
        canonical["publication_year"] = max(int(work.get("publication_year") or 0) for work in group) or None
        canonical["cited_by_count"] = max(int(work.get("cited_by_count") or 0) for work in group)
        canonical["_canonical_abstract"] = max(
            (restore_abstract(work.get("abstract_inverted_index")) for work in group),
            key=len,
            default="",
        )
        versions_by_url = {}
        for work in group:
            version = publication_version(work)
            key = version["url"] or version["openalex_url"] or version["openalex_work_id"]
            if key:
                versions_by_url[key] = version
        canonical["_canonical_versions"] = list(versions_by_url.values())
        canonical["_canonical_work_ids"] = [short_openalex_id(work.get("id", "")) for work in group]

        topics_by_id = {}
        for work in group:
            for topic in work_topics(work):
                topic_id = short_openalex_id(topic.get("id", ""))
                if topic_id and topic_id not in topics_by_id:
                    topics_by_id[topic_id] = topic
        canonical["topics"] = list(topics_by_id.values())

        authorships_by_id = {}
        for work in group:
            for authorship in work.get("authorships") or []:
                author = authorship.get("author") or {}
                author_id = short_openalex_id(author.get("id", ""))
                author_key = author_id or normalized_name(authorship.get("raw_author_name") or author.get("display_name"))
                if not author_key:
                    continue
                existing = authorships_by_id.get(author_key)
                if not existing or len(authorship.get("institutions") or []) > len(existing.get("institutions") or []):
                    authorships_by_id[author_key] = authorship
        canonical["authorships"] = list(authorships_by_id.values())
        canonical_works.append(canonical)

    return sorted(
        canonical_works,
        key=lambda work: (
            int(work.get("publication_year") or 0),
            int(work.get("cited_by_count") or 0),
            compact(work.get("display_name") or work.get("title")),
        ),
        reverse=True,
    )


def work_topics(work: dict) -> list[dict]:
    result = []
    for topic in (work.get("topics") or [])[:5]:
        if not isinstance(topic, dict):
            continue
        topic_id = short_openalex_id(topic.get("id", ""))
        label = compact(topic.get("display_name"))
        if topic_id.startswith("T") and label:
            result.append(topic)
    return result


def nested_display_name(value) -> str:
    return compact(value.get("display_name")) if isinstance(value, dict) else ""


def rank_weights(topic_count: int) -> list[float]:
    weights = list(TOPIC_RANK_WEIGHTS[:topic_count])
    total = sum(weights)
    return [weight / total for weight in weights] if total else []


def theme_trend(paper_count: int, recent_weight: float, prior_weight: float) -> str:
    if paper_count < 3:
        return "insufficient_data"
    if recent_weight >= max(1.5, prior_weight * 1.25):
        return "emerging"
    if prior_weight >= 1.5 and recent_weight <= prior_weight * 0.65:
        return "declining"
    return "stable"


def build_themes(works: list[dict]) -> tuple[list[dict], dict[str, str], set[str]]:
    aggregates: dict[str, dict] = {}
    for work in works:
        topics = work_topics(work)
        year = int(work.get("publication_year") or 0)
        work_id = short_openalex_id(work.get("id", ""))
        for topic, weight in zip(topics, rank_weights(len(topics))):
            topic_id = short_openalex_id(topic.get("id", ""))
            aggregate = aggregates.setdefault(topic_id, {
                "topic": topic,
                "weight": 0.0,
                "paper_count": 0,
                "recent_weight": 0.0,
                "prior_weight": 0.0,
                "recent_paper_count": 0,
                "years": defaultdict(int),
                "evidence": [],
            })
            aggregate["weight"] += weight
            aggregate["paper_count"] += 1
            if year:
                aggregate["years"][year] += 1
            if year >= CURRENT_YEAR - 5:
                aggregate["recent_weight"] += weight
                aggregate["recent_paper_count"] += 1
            elif year >= CURRENT_YEAR - 10:
                aggregate["prior_weight"] += weight
            aggregate["evidence"].append({
                "openalex_work_id": work_id,
                "title": compact(work.get("display_name") or work.get("title")),
                "year": year or None,
                "citations": int(work.get("cited_by_count") or 0),
                "doi": compact(work.get("doi")) or None,
                "topic_weight": round(weight, 6),
            })

    ranked = sorted(
        aggregates.items(),
        key=lambda item: (item[1]["weight"], item[1]["recent_weight"], item[1]["paper_count"], item[0]),
        reverse=True,
    )[:TOP_RESEARCHER_TOPICS]
    selected_ids = {topic_id for topic_id, _ in ranked}
    primary_topics: dict[str, str] = {}
    representative_work_ids: set[str] = set()
    for work in works:
        work_id = short_openalex_id(work.get("id", ""))
        for topic in work_topics(work):
            topic_id = short_openalex_id(topic.get("id", ""))
            if topic_id in selected_ids:
                primary_topics[work_id] = topic_id
                break

    digest = hashlib.sha256(
        json.dumps(
            [
                (topic_id, round(aggregate["weight"], 8), aggregate["paper_count"], sorted(aggregate["years"].items()))
                for topic_id, aggregate in ranked
            ],
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    total_papers = max(1, len(works))
    rows = []
    for topic_id, aggregate in ranked:
        topic = aggregate["topic"]
        years = sorted(aggregate["years"])
        evidence = sorted(
            aggregate["evidence"],
            key=lambda item: (item.get("year") or 0, item.get("citations") or 0, item.get("title") or ""),
            reverse=True,
        )[:TOP_EVIDENCE_PAPERS]
        representative_work_ids.update(item["openalex_work_id"] for item in evidence[:2])
        label = compact(topic.get("display_name"))
        rows.append({
            "theme_key": f"openalex:{topic_id}",
            "openalex_topic_id": topic_id,
            "label": label,
            "description": f"Research activity connected to {label}.",
            "keywords": [label],
            "domain_name": nested_display_name(topic.get("domain")),
            "field_name": nested_display_name(topic.get("field")),
            "subfield_name": nested_display_name(topic.get("subfield")),
            "topic_strength": round(aggregate["weight"] / total_papers, 8),
            "paper_share": round(aggregate["paper_count"] / total_papers, 8),
            "paper_count": aggregate["paper_count"],
            "first_year": years[0] if years else None,
            "latest_year": years[-1] if years else None,
            "recent_paper_count": aggregate["recent_paper_count"],
            "trend": theme_trend(
                aggregate["paper_count"],
                aggregate["recent_weight"],
                aggregate["prior_weight"],
            ),
            "confidence": round(min(0.99, 0.72 + 0.04 * math.log1p(aggregate["paper_count"])), 4),
            "evidence": {
                "papers": evidence,
                "year_counts": {str(year): aggregate["years"][year] for year in years},
                "source": "OpenAlex live Topics",
                "total_author_papers": len(works),
            },
            "source_hash": digest,
            "clustering_version": "openalex-live-rank-weight-v1",
            "embedding_model": "openalex-live",
        })
    return rows, primary_topics, representative_work_ids


def unique_institution_values(authorship: dict, key: str) -> list[str]:
    values = []
    seen = set()
    for institution in authorship.get("institutions") or []:
        value = compact(institution.get(key)) if isinstance(institution, dict) else ""
        if value and value not in seen:
            seen.add(value)
            values.append(value)
    return values


def build_collaborations(
    researcher: dict,
    config: dict,
    works: list[dict],
    profiles_by_openalex: dict[str, dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    focal_ids = {
        short_openalex_id(value)
        for value in [config.get("primary_openalex_id"), *(config.get("identity_aliases") or [])]
        if short_openalex_id(value).startswith("A")
    }
    full_name = normalized_name(researcher.get("full_name"))
    words = full_name.split()
    focal_name_keys = {full_name}
    if len(words) >= 2:
        focal_name_keys.add(" ".join(reversed(words)))

    coauthors: dict[str, dict] = {}
    yearly: dict[int, dict] = {}
    first_year_by_coauthor: dict[str, int] = {}
    paper_authors: list[dict] = []

    for work in works:
        work_id = short_openalex_id(work.get("id", ""))
        year = int(work.get("publication_year") or 0)
        title = compact(work.get("display_name") or work.get("title"))
        citations = int(work.get("cited_by_count") or 0)
        bucket = yearly.setdefault(year, {
            "active": set(),
            "works": set(),
            "other_institutions": set(),
            "counts": defaultdict(int),
            "names": {},
        })
        bucket["works"].add(work_id)
        seen_in_work = set()

        for authorship in work.get("authorships") or []:
            author = authorship.get("author") or {}
            coauthor_id = short_openalex_id(author.get("id", ""))
            author_name = compact(
                authorship.get("raw_author_name") or author.get("display_name") or "Unknown co-author"
            )
            if coauthor_id in focal_ids or normalized_name(author_name) in focal_name_keys:
                continue
            if not coauthor_id.startswith("A") or coauthor_id in seen_in_work:
                continue
            seen_in_work.add(coauthor_id)
            institution_ids = unique_institution_values(authorship, "id")
            institution_names = unique_institution_values(authorship, "display_name")
            mapped_profile = profiles_by_openalex.get(coauthor_id)

            bucket["active"].add(coauthor_id)
            bucket["counts"][coauthor_id] += 1
            bucket["names"][coauthor_id] = author_name
            first_year_by_coauthor[coauthor_id] = min(year, first_year_by_coauthor.get(coauthor_id, year))
            if not mapped_profile and not any("imperial college" in value.casefold() for value in institution_names):
                bucket["other_institutions"].add(coauthor_id)

            aggregate = coauthors.setdefault(coauthor_id, {
                "name": author_name,
                "work_ids": set(),
                "institutions": set(),
                "latest_year": year,
                "total_citations": 0,
                "papers": [],
            })
            if work_id not in aggregate["work_ids"]:
                aggregate["work_ids"].add(work_id)
                aggregate["total_citations"] += citations
                aggregate["papers"].append({
                    "title": title,
                    "year": year,
                    "citations": citations,
                    "openalex_work_id": work_id,
                })
            aggregate["latest_year"] = max(aggregate["latest_year"], year)
            aggregate["institutions"].update(institution_names)

            paper_authors.append({
                "openalex_work_id": work_id,
                "coauthor_openalex_id": coauthor_id,
                "coauthor_name": author_name,
                "institution_ids": institution_ids[:8],
                "institution_names": institution_names[:8],
                "publication_year": year,
                "cited_by_count": citations,
                "paper_title": title,
            })

    coauthor_rows = []
    for coauthor_id, aggregate in sorted(
        coauthors.items(),
        key=lambda item: (len(item[1]["work_ids"]), item[1]["latest_year"], item[1]["total_citations"]),
        reverse=True,
    ):
        coauthor_rows.append({
            "coauthor_openalex_id": coauthor_id,
            "coauthor_name": aggregate["name"],
            "shared_papers": len(aggregate["work_ids"]),
            "institution_names": sorted(aggregate["institutions"])[:8],
            "latest_year": aggregate["latest_year"],
            "total_citations": aggregate["total_citations"],
            "paper_titles": sorted(
                aggregate["papers"],
                key=lambda paper: (paper["year"], paper["citations"], paper["title"]),
                reverse=True,
            )[:10],
        })

    focal_department = normalized_group(researcher.get("affiliation"))
    focal_faculty = normalized_group(researcher.get("faculty"))
    total_coauthors = len(coauthors)
    matched_imperial = sum(1 for coauthor_id in coauthors if coauthor_id in profiles_by_openalex)
    collaboration_years = []
    for year, bucket in sorted(yearly.items()):
        imperial_ids = [coauthor_id for coauthor_id in bucket["active"] if coauthor_id in profiles_by_openalex]
        cross_department = [
            coauthor_id
            for coauthor_id in imperial_ids
            if focal_department
            and normalized_group(profiles_by_openalex[coauthor_id].get("affiliation"))
            and normalized_group(profiles_by_openalex[coauthor_id].get("affiliation")) != focal_department
        ]
        cross_faculty = [
            coauthor_id
            for coauthor_id in imperial_ids
            if focal_faculty
            and normalized_group(profiles_by_openalex[coauthor_id].get("faculty"))
            and normalized_group(profiles_by_openalex[coauthor_id].get("faculty")) != focal_faculty
        ]
        top_cross_department = []
        for coauthor_id in sorted(cross_department, key=lambda value: bucket["counts"][value], reverse=True)[:6]:
            profile = profiles_by_openalex[coauthor_id]
            top_cross_department.append({
                "researcher_id": profile.get("id"),
                "openalex_id": coauthor_id,
                "name": profile.get("full_name") or bucket["names"].get(coauthor_id),
                "department": profile.get("affiliation") or "",
                "faculty": profile.get("faculty") or "",
                "shared_papers": bucket["counts"][coauthor_id],
            })
        collaboration_years.append({
            "year": year,
            "active_coauthors": len(bucket["active"]),
            "new_coauthors": sum(1 for value in bucket["active"] if first_year_by_coauthor[value] == year),
            "imperial_coauthors": len(imperial_ids),
            "cross_department": len(cross_department),
            "cross_faculty": len(cross_faculty),
            "other_institutions": len(bucket["other_institutions"]),
            "shared_papers": len(bucket["works"]),
            "total_coauthors": total_coauthors,
            "matched_imperial_coauthors": matched_imperial,
            "top_cross_department": top_cross_department,
        })
    return paper_authors, coauthor_rows, collaboration_years


def paper_document_text(researcher: dict, paper: dict) -> str:
    return compact("\n".join([
        f"Researcher: {researcher.get('full_name', '')}",
        f"Position: {researcher.get('position_name') or researcher.get('position') or ''}",
        f"Department: {researcher.get('affiliation', '')}",
        f"Faculty: {researcher.get('faculty', '')}",
        f"Fields: {researcher.get('fields_of_research', '')}",
        f"Paper title: {paper.get('title', '')}",
        f"Abstract: {paper.get('abstract', '')}",
        f"Source: {paper.get('source_display_name', '')}",
        f"Topics: {'; '.join(paper.get('topics') or [])}",
    ]))


def profile_document_text(researcher: dict, papers: list[dict]) -> str:
    titles = "; ".join(
        f"{paper.get('publication_year') or 'Undated'}: {paper['title']}"
        for paper in sorted(
            papers,
            key=lambda item: (item.get("publication_year") or 0, item.get("cited_by_count") or 0, item["title"]),
            reverse=True,
        )
    )
    return compact("\n".join([
        f"Name: {researcher.get('full_name', '')}",
        f"Position: {researcher.get('position_name') or researcher.get('position') or ''}",
        f"Department: {researcher.get('affiliation', '')}",
        f"Faculty: {researcher.get('faculty', '')}",
        f"Fields of research: {researcher.get('fields_of_research', '')}",
        f"Researcher-written profile: {researcher.get('bio_about', '')}",
        f"Research: {researcher.get('research', '')}",
        f"Publication titles: {titles}",
    ]))


def embed_texts(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for batch_number, batch in enumerate(chunks(texts, 32), start=1):
        response = request_json(
            "https://api.openai.com/v1/embeddings",
            method="POST",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            body={"model": EMBEDDING_MODEL, "input": batch},
        ) or {}
        data = sorted(response.get("data") or [], key=lambda item: item.get("index", 0))
        if len(data) != len(batch):
            raise RuntimeError(f"Embedding batch {batch_number} returned {len(data)} of {len(batch)} vectors")
        vectors.extend(item["embedding"] for item in data)
        print(f"  embedded {len(vectors):,}/{len(texts):,} documents", flush=True)
    return vectors


def prepare_payload(
    researcher: dict,
    config: dict,
    works: list[dict],
    profiles_by_openalex: dict[str, dict],
    skip_embeddings: bool,
) -> dict:
    themes, primary_topics, representative_ids = build_themes(works)
    papers = []
    work_topic_rows = []
    for work in works:
        work_id = short_openalex_id(work.get("id", ""))
        topics = [compact(topic.get("display_name")) for topic in work_topics(work)]
        paper = {
            "openalex_work_id": work_id,
            "title": clean_openalex_text(work.get("display_name") or work.get("title")),
            "abstract": compact(work.get("_canonical_abstract")) or restore_abstract(work.get("abstract_inverted_index")),
            "publication_year": int(work.get("publication_year") or 0) or None,
            "cited_by_count": int(work.get("cited_by_count") or 0),
            "source_display_name": work_source_name(work),
            "doi": compact(work.get("doi")) or None,
            "topics": topics,
            "primary_topic_id": primary_topics.get(work_id),
            "is_representative": work_id in representative_ids,
            "embedding_model": EMBEDDING_MODEL,
            "metadata": {
                "openalex_id": config.get("primary_openalex_id"),
                "full_name": researcher.get("full_name"),
                "openalex_work_id": work_id,
                "source_work_ids": work.get("_canonical_work_ids") or [work_id],
                "versions": work.get("_canonical_versions") or [publication_version(work)],
            },
        }
        paper["document_text"] = paper_document_text(researcher, paper)
        papers.append(paper)
        work_topic_rows.append({"openalex_work_id": work_id, "topics": topics})

    profile_text = profile_document_text(researcher, papers)
    profile_document = {
        "document_text": profile_text,
        "embedding_model": EMBEDDING_MODEL,
        "metadata": {
            "openalex_id": config.get("primary_openalex_id"),
            "full_name": researcher.get("full_name"),
            "faculty": researcher.get("faculty"),
            "identity_source": "manual_openalex_override",
            "paper_source_ids": config.get("paper_source_ids") or [],
            "manual_work_ids": config.get("manual_work_ids") or [],
            "excluded_work_ids": config.get("excluded_work_ids") or [],
        },
    }

    if skip_embeddings:
        for paper in papers:
            paper["embedding"] = None
        profile_document["embedding"] = None
    else:
        embedding_inputs = [paper["document_text"][:PAPER_EMBEDDING_CHARS] for paper in papers]
        embedding_inputs.append(profile_text[:PROFILE_EMBEDDING_CHARS])
        vectors = embed_texts(embedding_inputs)
        for paper, vector in zip(papers, vectors[:-1]):
            paper["embedding"] = vector
        profile_document["embedding"] = vectors[-1]

    paper_authors, coauthors, collaboration_years = build_collaborations(
        researcher,
        config,
        works,
        profiles_by_openalex,
    )
    return {
        "p_researcher_id": researcher["id"],
        "p_papers": papers,
        "p_themes": themes,
        "p_paper_authors": paper_authors,
        "p_coauthors": coauthors,
        "p_collaboration_years": collaboration_years,
        "p_profile_document": profile_document,
        "p_work_topics": work_topic_rows,
    }


def selected_overrides(config: dict, args: argparse.Namespace) -> list[tuple[str, dict]]:
    requested_ids = set(args.researcher_id)
    requested_names = {normalized_name(value) for value in args.name}
    if not args.all and not requested_ids and not requested_names:
        raise SystemExit("Choose --researcher-id, --name, or --all")
    selected = []
    for researcher_id, override in config.items():
        if args.all or researcher_id in requested_ids or normalized_name(override.get("full_name")) in requested_names:
            selected.append((researcher_id, override))
    if not selected:
        raise SystemExit("No configured override matched the requested researcher")
    return selected


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
    args = parse_args()
    if not args.config.exists():
        raise SystemExit(f"Override file not found: {args.config}")
    if args.write and args.skip_embeddings:
        raise SystemExit("Refusing a live replacement without embeddings; remove --skip-embeddings")

    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    if not args.skip_embeddings:
        OPENAI_API_KEY = require_env("OPENAI_API_KEY")

    config = json.loads(args.config.read_text(encoding="utf-8"))
    selected = selected_overrides(config, args)
    print(f"Selected {len(selected)} verified researcher override(s)", flush=True)
    _, profiles_by_openalex = load_identity_directory()

    for index, (researcher_id, override) in enumerate(selected, start=1):
        researcher = load_researcher(researcher_id)
        configured_name = normalized_name(override.get("full_name"))
        if configured_name != normalized_name(researcher.get("full_name")):
            raise RuntimeError(
                f"Configured name {override.get('full_name')} does not match database profile {researcher.get('full_name')}"
            )
        print(f"[{index}/{len(selected)}] {researcher['full_name']}", flush=True)

        works_by_id: dict[str, dict] = {}
        for author_id in override.get("paper_source_ids") or []:
            for work in fetch_openalex_author_works(author_id, args.sleep):
                work_id = short_openalex_id(work.get("id", ""))
                if work_id.startswith("W"):
                    works_by_id.setdefault(work_id, work)
        for work_id in override.get("manual_work_ids") or []:
            work = fetch_openalex_work(work_id)
            resolved_id = short_openalex_id(work.get("id", ""))
            if resolved_id.startswith("W"):
                works_by_id[resolved_id] = work
            time.sleep(args.sleep)

        excluded_work_ids = {
            short_openalex_id(work_id)
            for work_id in (override.get("excluded_work_ids") or [])
        }
        raw_works = [
            work
            for work in works_by_id.values()
            if compact(work.get("display_name") or work.get("title"))
            and int(work.get("publication_year") or MIN_PUBLICATION_YEAR) >= MIN_PUBLICATION_YEAR
            and short_openalex_id(work.get("id", "")) not in excluded_work_ids
        ]
        raw_works.sort(
            key=lambda work: (
                int(work.get("publication_year") or 0),
                int(work.get("cited_by_count") or 0),
                compact(work.get("display_name") or work.get("title")),
            ),
            reverse=True,
        )
        works = canonicalize_works(raw_works)
        if not works:
            raise RuntimeError(f"No replacement works were fetched for {researcher['full_name']}")
        collapsed_versions = len(raw_works) - len(works)
        print(
            f"  verified replacement set: {len(works):,} publications "
            f"from {len(raw_works):,} OpenAlex works ({collapsed_versions:,} duplicate versions collapsed)",
            flush=True,
        )

        backup = fetch_existing_backup(researcher)
        args.backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = args.backup_dir / f"{researcher_id}-{int(time.time())}.json"
        backup_path.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  backed up {len(backup['papers']):,} existing paper rows", flush=True)

        payload = prepare_payload(
            researcher,
            override,
            works,
            profiles_by_openalex,
            args.skip_embeddings,
        )
        print(
            "  prepared "
            f"{len(payload['p_themes'])} themes, "
            f"{len(payload['p_coauthors']):,} co-authors, and "
            f"{len(payload['p_collaboration_years'])} collaboration years",
            flush=True,
        )
        if not args.write:
            print("  dry run complete; add --write to replace this profile", flush=True)
            continue

        result = request_json(
            f"{SUPABASE_URL}/rest/v1/rpc/replace_researcher_openalex_dataset",
            method="POST",
            body=payload,
            headers=supabase_headers(),
            timeout=600,
        )
        print(f"  database replacement complete: {json.dumps(result, ensure_ascii=False)}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
