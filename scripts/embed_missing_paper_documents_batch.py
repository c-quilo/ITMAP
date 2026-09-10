#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import socket
import time
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
PAPER_EMBEDDING_CHARS = 8000
EMBEDDING_BATCH_SIZE = 32
PAGE_SIZE = 1000
MAX_REQUEST_ATTEMPTS = 8
CURSOR_PATH = Path(".tmp/paper_embedding_cursor.txt")

SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
OPENAI_API_KEY = ""


def parse_args():
    parser = argparse.ArgumentParser(description="Embed missing researcher_paper_documents in batches.")
    parser.add_argument("--limit", type=int, default=5000)
    parser.add_argument("--researcher-openalex-id", action="append", default=[])
    parser.add_argument("--researcher-openalex-id-file", type=Path)
    parser.add_argument(
        "--paper-import-state",
        type=Path,
        help="Only process researcher/work pairs recorded by a completed paper import.",
    )
    parser.add_argument("--reset-cursor", action="store_true")
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
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code not in {429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526} or attempt == MAX_REQUEST_ATTEMPTS:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after HTTP {error.code}; attempt {attempt}/{MAX_REQUEST_ATTEMPTS} in {wait}s", flush=True)
            time.sleep(wait)
        except (TimeoutError, socket.timeout, urllib.error.URLError, ConnectionError) as error:
            if attempt == MAX_REQUEST_ATTEMPTS:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
            wait = min(60, 2 ** attempt)
            print(f"Retrying {method} after network error; attempt {attempt}/{MAX_REQUEST_ATTEMPTS} in {wait}s", flush=True)
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


def read_cursor() -> str:
    if not CURSOR_PATH.exists():
        return ""
    return CURSOR_PATH.read_text(encoding="utf-8").strip()


def write_cursor(paper_id: str):
    CURSOR_PATH.parent.mkdir(parents=True, exist_ok=True)
    CURSOR_PATH.write_text(f"{paper_id}\n", encoding="utf-8")


def load_researchers_by_openalex(openalex_ids: list[str]) -> dict[str, dict]:
    if not openalex_ids:
        return {}
    quoted = ",".join(urllib.parse.quote(item, safe="") for item in openalex_ids)
    rows = request_json(
        f"{SUPABASE_URL}/rest/v1/researchers?select=id,full_name,openalex_id,faculty,fields_of_research&openalex_id=in.({quoted})",
        headers=supabase_headers(),
    ) or []
    return {row["id"]: row for row in rows}


def load_researchers_by_ids(ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    rows = []
    for batch in chunks(ids, 200):
        quoted = ",".join(batch)
        rows.extend(
            request_json(
                f"{SUPABASE_URL}/rest/v1/researchers?select=id,full_name,openalex_id,faculty,fields_of_research&id=in.({quoted})",
                headers=supabase_headers(),
            )
            or []
        )
    return {row["id"]: row for row in rows}


def existing_doc_ids(paper_ids: list[str]) -> set[str]:
    existing = set()
    for batch in chunks(paper_ids, 200):
        quoted = ",".join(batch)
        rows = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?select=paper_id&paper_id=in.({quoted})",
            headers=supabase_headers(),
        ) or []
        existing.update(row["paper_id"] for row in rows if row.get("paper_id"))
    return existing


def load_imported_work_pairs(path: Path) -> set[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pairs = set()
    for key in data.get("completed_work_keys", []):
        researcher_id, separator, work_id = str(key).partition(":")
        if separator and researcher_id and work_id:
            pairs.add((researcher_id, work_id))
    return pairs


def load_imported_papers(imported_pairs: set[tuple[str, str]]) -> list[dict]:
    work_ids = sorted({work_id for _, work_id in imported_pairs})
    rows_by_id = {}
    for work_id_batch in chunks(work_ids, 100):
        offset = 0
        while True:
            query = {
                "select": "id,researcher_id,title,abstract,source_display_name,openalex_work_id",
                "openalex_work_id": f"in.({','.join(work_id_batch)})",
                "order": "id.asc",
                "limit": str(PAGE_SIZE),
                "offset": str(offset),
            }
            batch = request_json(
                f"{SUPABASE_URL}/rest/v1/researcher_papers?{urllib.parse.urlencode(query)}",
                headers=supabase_headers(),
            ) or []
            for row in batch:
                pair = (row.get("researcher_id", ""), row.get("openalex_work_id", ""))
                if row.get("id") and pair in imported_pairs:
                    rows_by_id[row["id"]] = row
            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    return list(rows_by_id.values())


def load_candidate_papers(limit: int, researcher_ids: list[str], start_after_id: str = "") -> list[dict]:
    rows = []
    last_id = start_after_id
    while len(rows) < limit:
        query = {
            "select": "id,researcher_id,title,abstract,source_display_name,openalex_work_id",
            "order": "id.asc",
            "limit": str(PAGE_SIZE),
        }
        if last_id:
            query["id"] = f"gt.{last_id}"
        if researcher_ids:
            query["researcher_id"] = f"in.({','.join(researcher_ids)})"
        batch = request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_papers?{urllib.parse.urlencode(query)}",
            headers=supabase_headers(),
        ) or []
        if not batch:
            break
        existing = existing_doc_ids([row["id"] for row in batch if row.get("id")])
        for row in batch:
            if row.get("id") and row["id"] not in existing and row.get("title"):
                rows.append(row)
                if len(rows) >= limit:
                    break
        last_id = batch[-1]["id"]
    return rows


def embed_texts(texts: list[str]) -> list[dict]:
    return request_json(
        "https://api.openai.com/v1/embeddings",
        method="POST",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        body={"model": EMBEDDING_MODEL, "input": texts},
    )["data"]


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

    if args.researcher_openalex_id_file:
        for value in args.researcher_openalex_id_file.read_text(encoding="utf-8").replace(",", "\n").splitlines():
            value = value.strip()
            if value.startswith("A") and value not in args.researcher_openalex_id:
                args.researcher_openalex_id.append(value)

    if args.paper_import_state and args.researcher_openalex_id:
        raise SystemExit("Use either --paper-import-state or a researcher OpenAlex ID scope, not both.")

    scoped_researchers = load_researchers_by_openalex(args.researcher_openalex_id)
    use_cursor = not scoped_researchers and not args.paper_import_state
    if args.reset_cursor and CURSOR_PATH.exists():
        CURSOR_PATH.unlink()
    start_after_id = read_cursor() if use_cursor else ""
    if start_after_id:
        print(f"Starting after paper cursor: {start_after_id}", flush=True)

    if args.paper_import_state:
        imported_pairs = load_imported_work_pairs(args.paper_import_state)
        print(f"Imported researcher/work pairs in scope: {len(imported_pairs)}", flush=True)
        imported_papers = load_imported_papers(imported_pairs)
        existing = existing_doc_ids([paper["id"] for paper in imported_papers if paper.get("id")])
        papers = [
            paper
            for paper in imported_papers
            if paper.get("id") and paper["id"] not in existing and paper.get("title")
        ][:args.limit]
        print(f"Imported paper rows found: {len(imported_papers)}", flush=True)
        print(f"Existing documents in scope: {len(existing)}", flush=True)
    else:
        papers = load_candidate_papers(args.limit, list(scoped_researchers), start_after_id)
    researchers = scoped_researchers or load_researchers_by_ids(sorted({paper["researcher_id"] for paper in papers}))
    print(f"Missing paper documents selected: {len(papers)}")
    if args.dry_run:
        return 0

    uploaded = 0
    for batch in chunks(papers, EMBEDDING_BATCH_SIZE):
        texts = [
            document_text(paper, researchers.get(paper["researcher_id"], {}))[:PAPER_EMBEDDING_CHARS]
            for paper in batch
        ]
        embeddings = embed_texts(texts)
        rows = []
        for paper, text, embedding in zip(batch, texts, embeddings):
            researcher = researchers.get(paper["researcher_id"], {})
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
        request_json(
            f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?on_conflict=paper_id",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates"),
            body=rows,
        )
        if use_cursor and batch:
            write_cursor(batch[-1]["id"])
        uploaded += len(rows)
        print(f"Embedded/uploaded {uploaded}/{len(papers)}", flush=True)
        time.sleep(0.2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
