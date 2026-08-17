#!/usr/bin/env python3
from __future__ import annotations

"""Backfill all OpenAlex works for already-matched Imperial researchers.

The original search database may only contain works that were easy to connect to
Imperial affiliation. For expert discovery, the matched OpenAlex author ID should
bring in the person's full career output.
"""

import argparse
import csv
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
PAPER_EMBEDDING_CHARS = 8000
MIN_PUBLICATION_YEAR = 1970
OPENALEX_PER_PAGE = 200
SUPABASE_BATCH_SIZE = 250
EMBEDDING_BATCH_SIZE = 16
DEFAULT_STATE_PATH = Path("/Users/caq13/Documents/ITMAP/openalex_author_works_backfill_state.json")


SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
OPENAI_API_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import all works for each matched OpenAlex author into Supabase."
    )
    parser.add_argument(
        "--scope",
        choices=["metadata", "embeddings", "all"],
        default="metadata",
        help="metadata imports researcher_papers; embeddings creates missing paper vectors; all does both.",
    )
    parser.add_argument("--limit-researchers", type=int, default=0, help="Only process this many researchers.")
    parser.add_argument("--name", default="", help="Only process researchers whose name contains this text.")
    parser.add_argument("--openalex-id", default="", help="Only process one OpenAlex author ID, e.g. A5029517450.")
    parser.add_argument("--openalex-id-file", type=Path, help="CSV or text file containing OpenAlex author IDs to process.")
    parser.add_argument("--state-path", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--reset-state", action="store_true", help="Ignore previous completed-researcher state.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and report without writing to Supabase.")
    parser.add_argument("--sleep", type=float, default=0.12, help="Delay between OpenAlex requests.")
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


def request_json(url: str, method: str = "GET", body=None, headers=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if body is not None:
        req.add_header("Content-Type", "application/json")

    for attempt in range(1, 6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after HTTP {error.code}; attempt {attempt}/5 in {wait}s", flush=True)
            time.sleep(wait)
        except (ConnectionError, OSError, TimeoutError, socket.timeout, urllib.error.URLError) as error:
            if attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after network error; attempt {attempt}/5 in {wait}s", flush=True)
            time.sleep(wait)

    raise RuntimeError(f"{method} {url} failed after retries")


def supabase_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def compact(value) -> str:
    return " ".join(str(value or "").split())


def restore_abstract(inverted) -> str:
    if not isinstance(inverted, dict):
        return ""
    positions = []
    for word, indexes in inverted.items():
        if not isinstance(indexes, list):
            continue
        for index in indexes:
            try:
                positions.append((int(index), word))
            except (TypeError, ValueError):
                continue
    return " ".join(word for _, word in sorted(positions))


def openalex_short_id(value: str) -> str:
    return (value or "").rstrip("/").rsplit("/", 1)[-1]


def source_display_name(work: dict) -> str:
    primary_location = work.get("primary_location") or {}
    source = primary_location.get("source") or {}
    return source.get("display_name") or ""


def topics_text(work: dict) -> str:
    topics = work.get("topics") or []
    names = []
    for topic in topics[:5]:
        name = topic.get("display_name") if isinstance(topic, dict) else ""
        if name:
            names.append(name)
    return "; ".join(names)


def load_state(path: Path, reset: bool) -> set[str]:
    if reset or not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    return set(data.get("completed_researcher_ids", []))


def save_state(path: Path, completed: set[str]):
    path.write_text(
        json.dumps({"completed_researcher_ids": sorted(completed)}, indent=2),
        encoding="utf-8",
    )


def load_researchers(args) -> list[dict]:
    researchers = []
    offset = 0
    while True:
        params = {
            "select": "id,full_name,openalex_id,faculty,fields_of_research",
            "openalex_id": "not.is.null",
            "order": "full_name.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        url = f"{SUPABASE_URL}/rest/v1/researchers?{urllib.parse.urlencode(params)}"
        rows = request_json(url, headers=supabase_headers()) or []
        if not rows:
            break
        researchers.extend(row for row in rows if row.get("openalex_id"))
        if len(rows) < 1000:
            break
        offset += 1000

    if args.name:
        needle = args.name.casefold()
        researchers = [row for row in researchers if needle in row.get("full_name", "").casefold()]
    if args.openalex_id:
        target = args.openalex_id.strip()
        researchers = [row for row in researchers if row.get("openalex_id") == target]
    if args.openalex_id_file:
        allowed = set()
        with args.openalex_id_file.open(newline="", encoding="utf-8") as handle:
            sample = handle.read(4096)
            handle.seek(0)
            if "," in sample and "new_openalex_id" in sample:
                for row in csv.DictReader(handle):
                    value = (row.get("new_openalex_id") or row.get("openalex_id") or "").strip()
                    if value.startswith("http"):
                        value = openalex_short_id(value)
                    if value.startswith("A"):
                        allowed.add(value)
            else:
                for value in handle.read().replace(",", "\n").splitlines():
                    value = value.strip()
                    if value.startswith("http"):
                        value = openalex_short_id(value)
                    if value.startswith("A"):
                        allowed.add(value)
        researchers = [row for row in researchers if row.get("openalex_id") in allowed]
    if args.limit_researchers:
        researchers = researchers[:args.limit_researchers]
    return researchers


def fetch_openalex_works(author_id: str, sleep_seconds: float) -> list[dict]:
    works = []
    cursor = "*"
    mailto = os.environ.get("OPENALEX_MAILTO", "")
    while True:
        params = {
            "filter": f"authorships.author.id:{author_id}",
            "per-page": str(OPENALEX_PER_PAGE),
            "cursor": cursor,
        }
        if mailto:
            params["mailto"] = mailto
        url = f"https://api.openalex.org/works?{urllib.parse.urlencode(params)}"
        data = request_json(url, timeout=180)
        results = data.get("results") or []
        works.extend(results)
        next_cursor = (data.get("meta") or {}).get("next_cursor")
        if not next_cursor or not results:
            break
        cursor = next_cursor
        time.sleep(sleep_seconds)
    return works


def existing_papers_by_work_id(researcher_id: str) -> dict[str, str]:
    rows = []
    offset = 0
    while True:
        params = {
            "select": "id,openalex_work_id",
            "researcher_id": f"eq.{researcher_id}",
            "limit": "1000",
            "offset": str(offset),
        }
        url = f"{SUPABASE_URL}/rest/v1/researcher_papers?{urllib.parse.urlencode(params)}"
        batch = request_json(url, headers=supabase_headers()) or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return {
        row["openalex_work_id"]: row["id"]
        for row in rows
        if row.get("openalex_work_id") and row.get("id")
    }


def paper_row(researcher_id: str, work: dict) -> dict | None:
    title = compact(work.get("display_name") or work.get("title"))
    work_id = openalex_short_id(work.get("id") or "")
    publication_year = work.get("publication_year")
    if not title or not work_id:
        return None
    if isinstance(publication_year, int) and publication_year < MIN_PUBLICATION_YEAR:
        return None
    return {
        "researcher_id": researcher_id,
        "openalex_work_id": work_id,
        "title": title,
        "abstract": compact(restore_abstract(work.get("abstract_inverted_index"))),
        "publication_year": publication_year,
        "cited_by_count": work.get("cited_by_count"),
        "source_display_name": source_display_name(work) or None,
        "doi": work.get("doi"),
    }


def upsert_paper_rows(rows: list[dict]) -> list[dict]:
    inserted = []
    for batch in chunks(rows, SUPABASE_BATCH_SIZE):
        response = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_papers?on_conflict=researcher_id,openalex_work_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
            body=batch,
        )
        inserted.extend(response or [])
    return inserted


def load_missing_paper_documents(paper_ids: list[str]) -> set[str]:
    missing = set(paper_ids)
    for batch in chunks(paper_ids, SUPABASE_BATCH_SIZE):
        quoted = ",".join(batch)
        rows = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?select=paper_id&paper_id=in.({quoted})",
            headers=supabase_headers(),
        ) or []
        for row in rows:
            if row.get("paper_id") in missing:
                missing.remove(row["paper_id"])
    return missing


def embed_texts(texts: list[str]) -> list[dict]:
    return request_json(
        "https://api.openai.com/v1/embeddings",
        method="POST",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        body={"model": EMBEDDING_MODEL, "input": texts},
    )["data"]


def paper_document_text(researcher: dict, paper: dict, work: dict | None = None) -> str:
    return compact(
        "\n".join([
            f"Researcher: {researcher.get('full_name', '')}",
            f"Faculty: {researcher.get('faculty', '')}",
            f"Fields: {researcher.get('fields_of_research', '')}",
            f"Paper title: {paper.get('title', '')}",
            f"Abstract: {paper.get('abstract', '')}",
            f"Source: {paper.get('source_display_name', '')}",
            f"Topics: {topics_text(work or {})}",
        ])
    )


def upsert_paper_embeddings(researcher: dict, paper_rows: list[dict], works_by_id: dict[str, dict], dry_run: bool):
    if not paper_rows:
        return 0
    paper_ids = [row["id"] for row in paper_rows if row.get("id")]
    missing_ids = load_missing_paper_documents(paper_ids)
    eligible = [row for row in paper_rows if row.get("id") in missing_ids]
    if dry_run or not eligible:
        return len(eligible)

    uploaded = 0
    for batch in chunks(eligible, EMBEDDING_BATCH_SIZE):
        doc_rows = []
        texts = []
        for paper in batch:
            work = works_by_id.get(paper.get("openalex_work_id", ""))
            text = paper_document_text(researcher, paper, work)
            texts.append(text[:PAPER_EMBEDDING_CHARS])
            doc_rows.append({
                "paper_id": paper["id"],
                "researcher_id": researcher["id"],
                "document_text": text,
                "embedding_model": EMBEDDING_MODEL,
                "metadata": {
                    "openalex_id": researcher.get("openalex_id"),
                    "full_name": researcher.get("full_name"),
                    "openalex_work_id": paper.get("openalex_work_id"),
                },
            })
        embeddings = embed_texts(texts)
        for row, embedding in zip(doc_rows, embeddings):
            row["embedding"] = embedding["embedding"]
        request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?on_conflict=paper_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates"),
            body=doc_rows,
        )
        uploaded += len(doc_rows)
        print(f"  embedded {uploaded}/{len(eligible)} papers", flush=True)
    return uploaded


def update_researcher_document_count(researcher: dict, paper_count: int, dry_run: bool):
    if dry_run:
        return
    metadata = {
        "openalex_id": researcher.get("openalex_id"),
        "full_name": researcher.get("full_name"),
        "faculty": researcher.get("faculty"),
    }
    request_json(
        f"{SUPABASE_URL}/rest/v1/researcher_documents?researcher_id=eq.{researcher['id']}",
        method="PATCH",
        headers=supabase_headers(),
        body={"paper_count": paper_count, "metadata": metadata},
    )


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    if args.scope in {"embeddings", "all"}:
        OPENAI_API_KEY = require_env("OPENAI_API_KEY")

    completed = load_state(args.state_path, args.reset_state)
    researchers = load_researchers(args)
    print(f"Loaded {len(researchers)} matched researchers")
    print(f"Already completed in state: {len(completed)}")

    total_new = 0
    total_seen = 0
    total_embeddings = 0

    for index, researcher in enumerate(researchers, start=1):
        researcher_id = researcher["id"]
        if researcher_id in completed:
            continue
        author_id = researcher.get("openalex_id", "")
        print(f"[{index}/{len(researchers)}] {researcher.get('full_name')} ({author_id})", flush=True)
        works = fetch_openalex_works(author_id, args.sleep)
        works_by_id = {openalex_short_id(work.get("id") or ""): work for work in works}
        existing = existing_papers_by_work_id(researcher_id)
        rows = [paper_row(researcher_id, work) for work in works]
        rows = [row for row in rows if row and row.get("openalex_work_id")]
        new_rows = [row for row in rows if row["openalex_work_id"] not in existing]

        print(f"  OpenAlex works: {len(works)}; Supabase existing: {len(existing)}; missing: {len(new_rows)}", flush=True)
        total_seen += len(works)
        total_new += len(new_rows)

        upserted = []
        if args.scope in {"metadata", "all"} and new_rows and not args.dry_run:
            upserted = upsert_paper_rows(new_rows)
            print(f"  upserted metadata rows: {len(upserted)}", flush=True)
        elif args.scope in {"metadata", "all"} and args.dry_run:
            print("  dry run: metadata not written", flush=True)

        if args.scope in {"embeddings", "all"}:
            if args.scope == "embeddings":
                paper_rows = []
                existing_after = existing_papers_by_work_id(researcher_id)
                for row in rows:
                    paper_id = existing_after.get(row["openalex_work_id"])
                    if paper_id:
                        paper_rows.append({**row, "id": paper_id})
            else:
                paper_rows = upserted
            total_embeddings += upsert_paper_embeddings(researcher, paper_rows, works_by_id, args.dry_run)

        if args.scope in {"metadata", "all"}:
            update_researcher_document_count(researcher, len(existing) + len(new_rows), args.dry_run)

        if not args.dry_run:
            completed.add(researcher_id)
            save_state(args.state_path, completed)
        time.sleep(args.sleep)

    print("Done")
    print(f"OpenAlex works seen: {total_seen}")
    print(f"Missing metadata rows found: {total_new}")
    print(f"Paper embeddings created/eligible: {total_embeddings}")
    print(f"State file: {args.state_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
