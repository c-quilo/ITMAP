#!/usr/bin/env python3
import csv
import json
from collections import defaultdict
from pathlib import Path

PROFILES_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_openalex.csv")
PAPERS_CSV = Path("/Users/caq13/Documents/ITMAP/researcher_papers.csv")
OUT_JSONL = Path("/Users/caq13/Documents/ITMAP/researcher_search_documents.jsonl")
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/researcher_search_documents.csv")
PAPER_DOCS_JSONL = Path("/Users/caq13/Documents/ITMAP/researcher_paper_search_documents.jsonl")


def restore_abstract(value: str) -> str:
    if not value:
      return ""
    try:
        inverted = json.loads(value)
    except json.JSONDecodeError:
        return ""
    positions = []
    for word, indexes in inverted.items():
        for index in indexes:
            positions.append((int(index), word))
    return " ".join(word for _, word in sorted(positions))


def compact(value: str) -> str:
    return " ".join((value or "").split())


def load_papers():
    papers = defaultdict(list)
    if not PAPERS_CSV.exists():
        return papers

    with PAPERS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            abstract = restore_abstract(row.get("abstract_inverted_index_json", ""))
            papers[row["researcher_openalex_id"]].append({
                "openalex_work_id": row.get("openalex_work_id", ""),
                "openalex_work_url": row.get("openalex_work_url", ""),
                "title": compact(row.get("title", "")),
                "abstract": compact(abstract),
                "publication_year": row.get("publication_year", ""),
                "cited_by_count": row.get("cited_by_count", ""),
                "source_display_name": row.get("source_display_name", ""),
                "doi": row.get("doi", ""),
                "topics": row.get("topics", ""),
            })
    return papers


def make_document(profile: dict, papers: list[dict]) -> str:
    parts = [
        f"Name: {profile.get('full_name', '')}",
        f"Position: {profile.get('position_name') or profile.get('position') or ''}",
        f"Affiliation: {profile.get('affiliation', '')}",
        f"Faculty: {profile.get('faculty', '')}",
        f"Fields of research: {profile.get('fields_of_research', '')}",
        f"Profile: {profile.get('bio_about', '')}",
        f"Research: {profile.get('research', '')}",
    ]

    if papers:
        paper_lines = []
        for paper in papers[:40]:
            line = f"Title: {paper['title']}"
            if paper.get("abstract"):
                line += f"\nAbstract: {paper['abstract']}"
            if paper.get("topics"):
                line += f"\nTopics: {paper['topics']}"
            paper_lines.append(line)
        parts.append("Selected OpenAlex papers:\n" + "\n\n".join(paper_lines))

    return compact("\n\n".join(part for part in parts if compact(part)))


def main() -> int:
    papers_by_author = load_papers()
    rows = []
    with PROFILES_CSV.open(newline="", encoding="utf-8") as f:
        for profile in csv.DictReader(f):
            author_papers = papers_by_author.get(profile.get("openalex_id", ""), [])
            document = make_document(profile, author_papers)
            rows.append({
                "profile_url": profile.get("url", ""),
                "full_name": profile.get("full_name", ""),
                "openalex_id": profile.get("openalex_id", ""),
                "email": profile.get("email", ""),
                "bio_about": profile.get("bio_about", ""),
                "research": profile.get("research", ""),
                "position_name": profile.get("position_name", ""),
                "position": profile.get("position", ""),
                "affiliation": profile.get("affiliation", ""),
                "faculty": profile.get("faculty", ""),
                "fields_of_research": profile.get("fields_of_research", ""),
                "paper_count": len(author_papers),
                "document_text": document,
                "papers": author_papers,
            })

    with OUT_JSONL.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    with PAPER_DOCS_JSONL.open("w", encoding="utf-8") as f:
        for row in rows:
            for paper in row["papers"]:
                paper_doc = {
                    "researcher_openalex_id": row["openalex_id"],
                    "profile_url": row["profile_url"],
                    "full_name": row["full_name"],
                    "openalex_work_id": paper["openalex_work_id"],
                    "title": paper["title"],
                    "abstract": paper["abstract"],
                    "publication_year": paper["publication_year"],
                    "cited_by_count": paper["cited_by_count"],
                    "source_display_name": paper["source_display_name"],
                    "doi": paper["doi"],
                    "document_text": compact(
                        f"Researcher: {row['full_name']}\n"
                        f"Faculty: {row['faculty']}\n"
                        f"Fields of research: {row['fields_of_research']}\n"
                        f"Paper title: {paper['title']}\n"
                        f"Abstract: {paper['abstract']}\n"
                        f"Topics: {paper['topics']}"
                    ),
                }
                f.write(json.dumps(paper_doc, ensure_ascii=False) + "\n")

    csv_fields = [key for key in rows[0].keys() if key != "papers"]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in csv_fields})

    print(f"Wrote {OUT_JSONL}")
    print(f"Wrote {OUT_CSV}")
    print(f"Wrote {PAPER_DOCS_JSONL}")
    print(f"Documents: {len(rows)}")
    print(f"With papers: {sum(1 for row in rows if row['paper_count'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
