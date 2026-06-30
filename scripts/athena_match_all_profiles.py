#!/usr/bin/env python3
import csv
import re
import subprocess
from pathlib import Path

from run_athena_query import REGION, start_query, wait_query, fetch_rows

SOURCE_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_cleaned.csv")
INPUT_LOCAL = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_match_input.csv")
INPUT_S3 = "s3://openalex-june-2026/athena-inputs/imperial_profiles_match_input.csv"
MATCHES_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_openalex_all_matches.csv")
OUTPUT_CSV = Path("/Users/caq13/Documents/ALMA/ITMAP/imperial_profiles_openalex.csv")

KEEP_COLUMNS = [
    "url",
    "full_name",
    "email",
    "bio_about",
    "research",
    "position_name",
    "position",
    "affiliation",
    "faculty",
    "fields_of_research",
]


def extract_orcid(row: dict) -> str:
    text = " ".join(str(row.get(k, "") or "") for k in ("bio_about", "research", "research_original"))
    found = re.findall(r"\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b", text)
    return found[0] if found else ""


def run_aws(args: list[str]) -> None:
    subprocess.check_call(["aws", *args, "--region", REGION])


def run_athena(sql: str) -> None:
    query_id = start_query(sql, "openalex_scratch")
    print(f"Started Athena query: {query_id}", flush=True)
    execution = wait_query(query_id)
    stats = execution.get("Statistics", {})
    scanned = int(stats.get("DataScannedInBytes", 0))
    elapsed_ms = int(stats.get("EngineExecutionTimeInMillis", 0))
    print(f"Succeeded. Scanned {scanned / 1024 ** 2:.2f} MiB; engine time {elapsed_ms / 1000:.1f}s")


def main() -> int:
    with SOURCE_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    with INPUT_LOCAL.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["ord", "full_name", "orcid"])
        writer.writeheader()
        for idx, row in enumerate(rows, start=1):
            writer.writerow({"ord": idx, "full_name": row.get("full_name", ""), "orcid": extract_orcid(row)})

    run_aws(["s3", "cp", str(INPUT_LOCAL), INPUT_S3])

    run_athena("DROP TABLE IF EXISTS imperial_profiles_input")
    run_athena(
        """
CREATE EXTERNAL TABLE imperial_profiles_input (
  ord int,
  full_name string,
  orcid string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://openalex-june-2026/athena-inputs/'
TBLPROPERTIES ('skip.header.line.count'='1')
"""
    )

    match_sql = """
WITH candidates AS (
  SELECT
    p.ord,
    p.full_name,
    p.orcid AS input_orcid,
    ia.openalex_id,
    ia.openalex_url,
    ia.display_name AS openalex_display_name,
    ia.orcid AS openalex_orcid,
    ia.works_count,
    ia.cited_by_count,
    (
      CASE
        WHEN p.orcid <> '' AND (
          ia.orcid = concat('https://orcid.org/', p.orcid)
          OR ia.orcid = p.orcid
          OR ia.ids_orcid = concat('https://orcid.org/', p.orcid)
          OR ia.ids_orcid = p.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN lower(ia.display_name) = lower(p.full_name) THEN 250 ELSE 0 END
      + least(coalesce(ia.works_count, 0), 200)
    ) AS score,
    CASE
      WHEN p.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', p.orcid)
        OR ia.orcid = p.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', p.orcid)
        OR ia.ids_orcid = p.orcid
      ) THEN 'orcid+imperial'
      WHEN lower(ia.display_name) = lower(p.full_name) THEN 'exact_name+imperial'
      ELSE 'other'
    END AS match_reason
  FROM imperial_profiles_input p
  JOIN imperial_authors ia
    ON lower(ia.display_name) = lower(p.full_name)
    OR (
      p.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', p.orcid)
        OR ia.orcid = p.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', p.orcid)
        OR ia.ids_orcid = p.orcid
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
  p.ord,
  p.full_name,
  coalesce(b.openalex_id, '') AS openalex_id,
  coalesce(b.openalex_url, '') AS openalex_url,
  coalesce(b.openalex_display_name, '') AS openalex_display_name,
  coalesce(b.openalex_orcid, '') AS openalex_orcid,
  coalesce(cast(b.works_count AS varchar), '') AS works_count,
  coalesce(cast(b.cited_by_count AS varchar), '') AS cited_by_count,
  coalesce(cast(b.score AS varchar), '') AS score,
  coalesce(b.match_reason, '') AS match_reason
FROM imperial_profiles_input p
LEFT JOIN best b ON p.ord = b.ord
ORDER BY p.ord
"""
    query_id = start_query(match_sql, "openalex_scratch")
    print(f"Started Athena full match query: {query_id}", flush=True)
    execution = wait_query(query_id)
    stats = execution.get("Statistics", {})
    print(
        f"Succeeded. Scanned {int(stats.get('DataScannedInBytes', 0)) / 1024 ** 2:.2f} MiB; "
        f"engine time {int(stats.get('EngineExecutionTimeInMillis', 0)) / 1000:.1f}s"
    )

    result_rows = fetch_rows(query_id)
    with MATCHES_CSV.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(result_rows)

    header = result_rows[0]
    matches = {int(row[0]): dict(zip(header, row)) for row in result_rows[1:] if row and row[0].isdigit()}

    output_columns = ["url", "full_name", "openalex_id", *KEEP_COLUMNS[2:]]
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=output_columns)
        writer.writeheader()
        for idx, row in enumerate(rows, start=1):
            out = {col: row.get(col, "") for col in KEEP_COLUMNS}
            out["openalex_id"] = matches.get(idx, {}).get("openalex_id", "")
            writer.writerow({col: out.get(col, "") for col in output_columns})

    matched = sum(1 for match in matches.values() if match.get("openalex_id"))
    print(f"Wrote {OUTPUT_CSV}")
    print(f"Wrote {MATCHES_CSV}")
    print(f"Matched {matched} of {len(rows)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
