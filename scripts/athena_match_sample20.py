#!/usr/bin/env python3
import csv
import re
import subprocess
from pathlib import Path

from run_athena_query import REGION, start_query, wait_query, fetch_rows

CSV_PATH = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_cleaned.csv")
SQL_PATH = Path("/Users/caq13/Documents/ITMAP/scripts/athena_match_sample20.sql")
MATCHES_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_sample20_matches.csv")
OUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_sample20.csv")


def sql_string(value: str) -> str:
    return "'" + (value or "").replace("'", "''") + "'"


def extract_orcid(row: dict) -> str:
    text = " ".join(str(row.get(k, "") or "") for k in ("bio_about", "research", "research_original"))
    found = re.findall(r"\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b", text)
    return found[0] if found else ""


def main() -> int:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    sample = rows[:20]

    values = []
    for idx, row in enumerate(sample, start=1):
        values.append(f"({idx}, {sql_string(row['full_name'])}, {sql_string(extract_orcid(row))})")
    values_sql = ",\n    ".join(values)

    sql = f"""
WITH sample(ord, full_name, orcid) AS (
  VALUES
    {values_sql}
),
candidates AS (
  SELECT
    s.ord,
    s.full_name,
    s.orcid AS input_orcid,
    ia.openalex_id,
    ia.openalex_url,
    ia.display_name AS openalex_display_name,
    ia.orcid AS openalex_orcid,
    ia.works_count,
    ia.cited_by_count,
    (
      CASE
        WHEN s.orcid <> '' AND (
          ia.orcid = concat('https://orcid.org/', s.orcid)
          OR ia.orcid = s.orcid
          OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
          OR ia.ids_orcid = s.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN lower(ia.display_name) = lower(s.full_name) THEN 250 ELSE 0 END
      + least(coalesce(ia.works_count, 0), 200)
    ) AS score,
    CASE
      WHEN s.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', s.orcid)
        OR ia.orcid = s.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
        OR ia.ids_orcid = s.orcid
      ) THEN 'orcid+imperial'
      WHEN lower(ia.display_name) = lower(s.full_name) THEN 'exact_name+imperial'
      ELSE 'other'
    END AS match_reason
  FROM sample s
  JOIN imperial_authors ia
    ON lower(ia.display_name) = lower(s.full_name)
    OR (
      s.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', s.orcid)
        OR ia.orcid = s.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
        OR ia.ids_orcid = s.orcid
      )
    )
),
best AS (
  SELECT *
  FROM (
    SELECT
      candidates.*,
      row_number() OVER (
        PARTITION BY ord
        ORDER BY score DESC, works_count DESC, cited_by_count DESC, openalex_id
      ) AS rn
    FROM candidates
  )
  WHERE rn = 1
)
SELECT
  s.ord,
  s.full_name,
  coalesce(b.openalex_id, '') AS openalex_id,
  coalesce(b.openalex_url, '') AS openalex_url,
  coalesce(b.openalex_display_name, '') AS openalex_display_name,
  coalesce(b.openalex_orcid, '') AS openalex_orcid,
  coalesce(cast(b.works_count AS varchar), '') AS works_count,
  coalesce(cast(b.cited_by_count AS varchar), '') AS cited_by_count,
  coalesce(cast(b.score AS varchar), '') AS score,
  coalesce(b.match_reason, '') AS match_reason
FROM sample s
LEFT JOIN best b ON s.ord = b.ord
ORDER BY s.ord
"""
    SQL_PATH.write_text(sql, encoding="utf-8")

    query_id = start_query(sql, "openalex_scratch")
    print(f"Started Athena sample match query: {query_id}", flush=True)
    execution = wait_query(query_id)
    stats = execution.get("Statistics", {})
    scanned = int(stats.get("DataScannedInBytes", 0))
    print(f"Succeeded. Scanned {scanned / 1024 ** 2:.2f} MiB")

    result_rows = fetch_rows(query_id)
    with MATCHES_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(result_rows)

    header = result_rows[0]
    matches = {int(row[0]): dict(zip(header, row)) for row in result_rows[1:]}

    fieldnames = list(rows[0].keys())
    full_name_index = fieldnames.index("full_name")
    out_fieldnames = fieldnames[: full_name_index + 1] + ["openalex_id"] + fieldnames[full_name_index + 1 :]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fieldnames)
        writer.writeheader()
        for idx, row in enumerate(sample, start=1):
            out = dict(row)
            out["openalex_id"] = matches.get(idx, {}).get("openalex_id", "")
            writer.writerow(out)

    print(f"Wrote {OUT_CSV}")
    print(f"Wrote {MATCHES_CSV}")
    for idx in range(1, 21):
        match = matches.get(idx, {})
        print(f"{idx:02d}. {match.get('full_name','')} -> {match.get('openalex_id','')} ({match.get('match_reason','')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
