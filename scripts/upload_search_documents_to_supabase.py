#!/usr/bin/env python3
import argparse
import json
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path

DOCS_JSONL = Path("/Users/caq13/Documents/ITMAP/researcher_search_documents.jsonl")
EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
BATCH_SIZE = 25
PAPER_VECTOR_BATCH_SIZE = 10
RESEARCHER_EMBEDDING_CHARS = 8000
PAPER_EMBEDDING_CHARS = 8000


def parse_args():
    parser = argparse.ArgumentParser(
        description="Upload researcher search documents and embeddings to Supabase."
    )
    parser.add_argument(
        "--scope",
        choices=["researchers", "paper-metadata", "paper-embeddings", "all"],
        default="all",
        help="Upload researcher embeddings, paper metadata without embeddings, or include paper-level embeddings too.",
    )
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


SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
OPENAI_API_KEY = ""


def request_json(url: str, method: str = "GET", body=None, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for attempt in range(1, 6):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error.code} {detail}") from error
            wait = min(30, 2 ** attempt)
            print(f"Retrying {method} after HTTP {error.code}; attempt {attempt}/5 in {wait}s", flush=True)
            time.sleep(wait)
        except (TimeoutError, socket.timeout, urllib.error.URLError) as error:
            if attempt == 5:
                raise RuntimeError(f"{method} {url} failed: {error}") from error
            wait = min(30, 2 ** attempt)
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


def embed_texts(texts):
    return request_json(
        "https://api.openai.com/v1/embeddings",
        method="POST",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        body={"model": EMBEDDING_MODEL, "input": texts},
    )["data"]


def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def dedupe_paper_rows(paper_rows):
    deduped = {}
    for row in paper_rows:
        key = (row.get("researcher_id"), row.get("openalex_work_id") or row.get("title"))
        if key[0] and key[1] and key not in deduped:
            deduped[key] = row
    return list(deduped.values())


def dedupe_paper_document_rows(paper_document_rows):
    deduped = {}
    for row in paper_document_rows:
        paper_id = row.get("paper_id")
        if paper_id and paper_id not in deduped:
            deduped[paper_id] = row
    return list(deduped.values())


def load_existing_paper_document_ids(paper_ids):
    if not paper_ids:
        return set()
    quoted_ids = ",".join(str(paper_id) for paper_id in paper_ids)
    rows = request_json(
        f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?select=paper_id&embedding=not.is.null&paper_id=in.({quoted_ids})",
        headers=supabase_headers(),
    ) or []
    return {row["paper_id"] for row in rows if row.get("paper_id")}


def load_paper_ids_for_researchers(researcher_ids):
    if not researcher_ids:
        return {}
    quoted_ids = ",".join(str(researcher_id) for researcher_id in researcher_ids)
    rows = request_json(
        f"{SUPABASE_URL}/rest/v1/researcher_papers?select=id,researcher_id,openalex_work_id&researcher_id=in.({quoted_ids})",
        headers=supabase_headers(),
    ) or []
    return {
        (row.get("researcher_id"), row.get("openalex_work_id")): row["id"]
        for row in rows
        if row.get("researcher_id") and row.get("openalex_work_id") and row.get("id")
    }


def main() -> int:
    global SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
    args = parse_args()
    include_researcher_embeddings = args.scope in {"researchers", "all"}
    include_paper_metadata = args.scope in {"paper-metadata", "all"}
    collect_paper_inputs = args.scope in {"paper-metadata", "paper-embeddings", "all"}
    include_paper_embeddings = args.scope in {"paper-embeddings", "all"}
    SUPABASE_URL = require_supabase_url()
    SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
    if include_researcher_embeddings or include_paper_embeddings:
        OPENAI_API_KEY = require_env("OPENAI_API_KEY")
    docs = [json.loads(line) for line in DOCS_JSONL.read_text(encoding="utf-8").splitlines() if line.strip()]
    scope_labels = {
        "researchers": "researcher documents only",
        "paper-metadata": "paper metadata only",
        "paper-embeddings": "paper embeddings only",
        "all": "researcher and paper documents",
    }
    print(f"Uploading {len(docs)} {scope_labels[args.scope]} to Supabase")
    existing_paper_document_ids = set()

    for batch_num, batch in enumerate(chunks(docs, BATCH_SIZE), start=1):
        embeddings = (
            embed_texts([doc["document_text"][:RESEARCHER_EMBEDDING_CHARS] for doc in batch])
            if include_researcher_embeddings
            else [None] * len(batch)
        )

        researcher_rows = []
        paper_rows = []
        paper_doc_inputs = []
        document_rows = []
        for doc, embedding_item in zip(batch, embeddings):
            researcher_rows.append({
                "profile_url": doc["profile_url"],
                "full_name": doc["full_name"],
                "openalex_id": doc["openalex_id"] or None,
                "email": doc["email"] or None,
                "bio_about": doc["bio_about"] or None,
                "research": doc["research"] or None,
                "position_name": doc["position_name"] or None,
                "position": doc["position"] or None,
                "affiliation": doc["affiliation"] or None,
                "faculty": doc["faculty"] or None,
                "fields_of_research": doc["fields_of_research"] or None,
            })

        inserted = request_json(
            f"{SUPABASE_URL}/rest/v1/researchers?on_conflict=profile_url",
            method="POST",
            headers=supabase_headers("resolution=merge-duplicates,return=representation"),
            body=researcher_rows,
        )
        ids_by_profile_url = {row.get("profile_url"): row["id"] for row in inserted if row.get("profile_url")}
        ids_by_name = {row.get("full_name"): row["id"] for row in inserted}

        for doc, embedding_item in zip(batch, embeddings):
            researcher_id = ids_by_profile_url.get(doc["profile_url"]) or ids_by_name.get(doc["full_name"])
            if not researcher_id:
                continue
            if collect_paper_inputs:
                for paper in doc["papers"]:
                    if include_paper_metadata:
                        paper_rows.append({
                            "researcher_id": researcher_id,
                            "openalex_work_id": paper["openalex_work_id"] or None,
                            "title": paper["title"],
                            "abstract": paper["abstract"] or None,
                            "publication_year": int(paper["publication_year"]) if str(paper["publication_year"]).isdigit() else None,
                            "cited_by_count": int(paper["cited_by_count"]) if str(paper["cited_by_count"]).isdigit() else None,
                            "source_display_name": paper["source_display_name"] or None,
                            "doi": paper["doi"] or None,
                        })
                    if include_paper_embeddings:
                        paper_doc_inputs.append({
                            "researcher_id": researcher_id,
                            "openalex_work_id": paper["openalex_work_id"] or None,
                            "document_text": " ".join([
                                f"Researcher: {doc['full_name']}",
                                f"Faculty: {doc['faculty']}",
                                f"Fields: {doc['fields_of_research']}",
                                f"Paper title: {paper['title']}",
                                f"Abstract: {paper['abstract']}",
                                f"Source: {paper['source_display_name']}",
                            ]).strip(),
                            "metadata": {
                                "openalex_id": doc["openalex_id"],
                                "full_name": doc["full_name"],
                                "openalex_work_id": paper["openalex_work_id"],
                            },
                        })
            if include_researcher_embeddings and embedding_item:
                document_rows.append({
                    "researcher_id": researcher_id,
                    "document_text": doc["document_text"],
                    "paper_count": doc["paper_count"],
                    "embedding_model": EMBEDDING_MODEL,
                    "embedding": embedding_item["embedding"],
                    "metadata": {
                        "openalex_id": doc["openalex_id"],
                        "full_name": doc["full_name"],
                        "faculty": doc["faculty"],
                    },
                })

        paper_ids = {}
        if paper_rows:
            paper_rows = dedupe_paper_rows(paper_rows)
            inserted_papers = request_json(
                f"{SUPABASE_URL}/rest/v1/researcher_papers?on_conflict=researcher_id,openalex_work_id",
                method="POST",
                headers=supabase_headers("resolution=merge-duplicates,return=representation"),
                body=paper_rows,
            )
            paper_ids = {
                (row.get("researcher_id"), row.get("openalex_work_id")): row["id"]
                for row in inserted_papers
                if row.get("openalex_work_id")
            }

        if include_paper_embeddings and not paper_rows:
            paper_ids = load_paper_ids_for_researchers(list(ids_by_profile_url.values()))

        if include_paper_embeddings:
            for paper_batch in chunks(paper_doc_inputs, PAPER_VECTOR_BATCH_SIZE):
                paper_ids_for_batch = []
                for paper_doc in paper_batch:
                    paper_id = paper_ids.get((paper_doc["researcher_id"], paper_doc["openalex_work_id"]))
                    if paper_id:
                        paper_ids_for_batch.append(paper_id)

                existing_paper_document_ids.update(load_existing_paper_document_ids(paper_ids_for_batch))

                eligible_papers = []
                for paper_doc in paper_batch:
                    paper_id = paper_ids.get((paper_doc["researcher_id"], paper_doc["openalex_work_id"]))
                    if not paper_id or paper_id in existing_paper_document_ids:
                        continue
                    eligible_papers.append({**paper_doc, "paper_id": paper_id})
                if not eligible_papers:
                    continue

                paper_embeddings = embed_texts([paper["document_text"][:PAPER_EMBEDDING_CHARS] for paper in eligible_papers])
                paper_document_rows = []
                for paper_doc, embedding_item in zip(eligible_papers, paper_embeddings):
                    paper_id = paper_doc["paper_id"]
                    paper_document_rows.append({
                        "paper_id": paper_id,
                        "researcher_id": paper_doc["researcher_id"],
                        "document_text": paper_doc["document_text"],
                        "embedding_model": EMBEDDING_MODEL,
                        "embedding": embedding_item["embedding"],
                        "metadata": paper_doc["metadata"],
                    })
                if paper_document_rows:
                    paper_document_rows = dedupe_paper_document_rows(paper_document_rows)
                    request_json(
                        f"{SUPABASE_URL}/rest/v1/researcher_paper_documents?on_conflict=paper_id",
                        method="POST",
                        headers=supabase_headers("resolution=merge-duplicates"),
                        body=paper_document_rows,
                    )
                    existing_paper_document_ids.update(row["paper_id"] for row in paper_document_rows)

        if document_rows:
            request_json(
                f"{SUPABASE_URL}/rest/v1/researcher_documents?on_conflict=researcher_id",
                method="POST",
                headers=supabase_headers("resolution=merge-duplicates"),
                body=document_rows,
            )

        print(f"Uploaded batch {batch_num}; rows {min(batch_num * BATCH_SIZE, len(docs))}/{len(docs)}", flush=True)
        time.sleep(0.2)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
