#!/usr/bin/env python3
from __future__ import annotations

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
SUPABASE_PAGE_SIZE = 1000
EMBEDDING_BATCH_SIZE = 64
INSERT_BATCH_SIZE = 100

SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
OPENAI_API_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(description="Embed missing paper documents for selected OpenAlex author IDs.")
    parser.add_argument("--matches-csv", type=Path, help="CSV containing an openalex_id column.")
    parser.add_argument("--openalex-id", action="append", default=[], help="Additional OpenAlex author ID to include.")
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


def request_json(url: str, method: str = "GET", body=None, headers=None, timeout=180):
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


def load_openalex_ids(matches_csv: Path | None, extra_ids: list[str]) -> list[str]:
    ids = []
    seen = set()
    if matches_csv:
        with matches_csv.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                openalex_id = (row.get("openalex_id") or "").strip()
                if openalex_id and openalex_id not in seen:
                    seen.add(openalex_id)
                    ids.append(openalex_id)
    for openalex_id in extra_ids:
        openalex_id = openalex_id.strip()
        if openalex_id and openalex_id not in seen:
            seen.add(openalex_id)
            ids.append(openalex_id)
    return ids


def load_researchers(openalex_ids: list[str]) -> list[dict]:
    rows = []
    for batch in chunks(openalex_ids, 100):
        quoted = ",".join(urllib.parse.quote(item, safe="") for item in batch)
        rows.extend(
            request_json(
                f"{SUPABASE_URL}/rest/v1/researchers?select=id,full_name,openalex_id,faculty,fields_of_research&openalex_id=in.({quoted})",
                headers=supabase_headers(),
            )
            or []
        )
    return rows


def load_papers(researcher_ids: list[str]) -> list[dict]:
    rows = []
    for researcher_id_batch in chunks(researcher_ids, 75):
        quoted = ",".join(researcher_id_batch)
        offset = 0
        while True:
            params = {
                "select": "id,researcher_id,title,abstract,source_display_name,openalex_work_id",
                "researcher_id": f"in.({quoted})",
                "order": "researcher_id.asc",
                "limit": str(SUPABASE_PAGE_SIZE),
                "offset": str(offset),
            }
            url = f"{SUPABASE_URL}/rest/v1/researcher_papers?{urllib.parse.urlencode(params)}"
            batch = request_json(url, headers=supabase_headers()) or []
            rows.extend(batch)
            if len(batch) < SUPABASE_PAGE_SIZE:
                break
            offset += SUPABASE_PAGE_SIZE
    return rows


def load_existing_document_paper_ids(paper_ids: list[str]) -> set[str]:
    existing = set()
    for batch in chunks(paper_ids, 200):
        quoted = ",".join(batch)
        rows = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?select=paper_id&paper_id=in.({quoted})",
            headers=supabase_headers(),
        ) or []
        existing.update(row["paper_id"] for row in rows if row.get("paper_id"))
    return existing


def embed_texts(texts: list[str]) -> list[dict]:
    response = request_json(
        "https://api.openai.com/v1/embeddings",
        method="POST",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        body={"model": EMBEDDING_MODEL, "input": texts},
    )
    return response["data"]


def document_text(paper: dict, researcher: dict) -> str:
    return " ".join(
        part
        for part in [
            f"Researcher: {researcher.get('full_name')}",
            f"Faculty: {researcher.get('faculty')}",
            f"Fields: {researcher.get('fields_of_research')}",
            f"Paper title: {paper.get('title')}",
            f"Abstract: {paper.get('abstract')}",
            f"Source: {paper.get('source_display_name')}",
        ]
        if part and not part.endswith(": None")
    ).strip()


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
    args = parse_args()
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    OPENAI_API_KEY = require_env("OPENAI_API_KEY")

    openalex_ids = load_openalex_ids(args.matches_csv, args.openalex_id)
    print(f"Input OpenAlex IDs: {len(openalex_ids)}", flush=True)
    researchers = load_researchers(openalex_ids)
    researchers_by_id = {row["id"]: row for row in researchers if row.get("id")}
    print(f"Matched Supabase researchers: {len(researchers_by_id)}", flush=True)

    papers = load_papers(list(researchers_by_id))
    existing = load_existing_document_paper_ids([paper["id"] for paper in papers if paper.get("id")])
    missing = [paper for paper in papers if paper.get("id") and paper["id"] not in existing and paper.get("title")]
    print(f"Papers found: {len(papers)}", flush=True)
    print(f"Existing paper documents: {len(existing)}", flush=True)
    print(f"Missing paper documents to embed: {len(missing)}", flush=True)
    if args.dry_run:
        return 0

    uploaded = 0
    for batch in chunks(missing, EMBEDDING_BATCH_SIZE):
        texts = [
            document_text(paper, researchers_by_id[paper["researcher_id"]])[:PAPER_EMBEDDING_CHARS]
            for paper in batch
        ]
        embeddings = embed_texts(texts)
        rows = []
        for paper, text, embedding in zip(batch, texts, embeddings):
            researcher = researchers_by_id[paper["researcher_id"]]
            rows.append(
                {
                    "paper_id": paper["id"],
                    "researcher_id": paper["researcher_id"],
                    "document_text": text,
                    "embedding_model": EMBEDDING_MODEL,
                    "embedding": embedding["embedding"],
                    "metadata": {
                        "openalex_id": researcher.get("openalex_id"),
                        "full_name": researcher.get("full_name"),
                        "openalex_work_id": paper.get("openalex_work_id"),
                    },
                }
            )
        for insert_batch in chunks(rows, INSERT_BATCH_SIZE):
            request_json(
                f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?on_conflict=paper_id",
                method="POST",
                headers=supabase_headers("resolution=merge-duplicates"),
                body=insert_batch,
            )
            uploaded += len(insert_batch)
        print(f"Embedded/uploaded {uploaded}/{len(missing)}", flush=True)
        time.sleep(0.2)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
