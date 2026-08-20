#!/usr/bin/env python3
from __future__ import annotations

import csv
from pathlib import Path


INPUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_unmatched_athena_input.csv")
OUT_SQL = Path("/Users/caq13/Documents/ITMAP/scripts/athena_match_unmatched_author_candidates_exact.sql")


def sql_quote(value: str) -> str:
    return "'" + (value or "").replace("'", "''") + "'"


def main() -> int:
    names = set()
    orcids = set()
    with INPUT_CSV.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("full_name") or "").strip().lower()
            if name and name != "#name?":
                names.add(name)
            orcid = (row.get("orcid") or "").strip()
            if orcid:
                orcids.add(orcid)

    name_values = ",\n    ".join(sql_quote(name) for name in sorted(names))
    orcid_values = ",\n    ".join(sql_quote(orcid) for orcid in sorted(orcids)) or "''"

    OUT_SQL.write_text(f"""
WITH author_hits AS (
  SELECT
    regexp_extract(id, 'A[0-9]+') AS openalex_id,
    id AS openalex_url,
    display_name,
    raw_author_names,
    orcid,
    ids.orcid AS ids_orcid,
    works_count,
    cited_by_count,
    last_known_institutions,
    affiliations,
    lower(display_name) AS display_name_lc,
    transform(raw_author_names, n -> lower(n)) AS raw_author_names_lc,
    any_match(
      last_known_institutions,
      inst -> inst.id = 'https://openalex.org/I47508984' OR inst.id = 'I47508984'
    )
    OR any_match(
      affiliations,
      aff -> aff.institution.id = 'https://openalex.org/I47508984' OR aff.institution.id = 'I47508984'
    ) AS has_imperial_affiliation
  FROM authors_json
  WHERE lower(display_name) IN (
    {name_values}
  )
  OR any_match(raw_author_names, n -> lower(n) IN (
    {name_values}
  ))
  OR replace(orcid, 'https://orcid.org/', '') IN (
    {orcid_values}
  )
  OR replace(ids.orcid, 'https://orcid.org/', '') IN (
    {orcid_values}
  )
),
candidates AS (
  SELECT
    i.ord,
    i.researcher_id,
    i.profile_url,
    i.full_name,
    i.orcid AS input_orcid,
    i.position_name,
    i.position,
    i.affiliation,
    i.faculty,
    i.fields_of_research,
    a.openalex_id,
    a.openalex_url,
    a.display_name AS openalex_display_name,
    a.orcid AS openalex_orcid,
    a.ids_orcid,
    a.works_count,
    a.cited_by_count,
    a.has_imperial_affiliation,
    transform(slice(a.last_known_institutions, 1, 5), inst -> inst.display_name) AS last_known_institution_names,
    transform(slice(a.affiliations, 1, 5), aff -> aff.institution.display_name) AS affiliation_names,
    (
      CASE
        WHEN i.orcid <> '' AND (
          replace(a.orcid, 'https://orcid.org/', '') = i.orcid
          OR replace(a.ids_orcid, 'https://orcid.org/', '') = i.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN a.display_name_lc = lower(i.full_name) THEN 300 ELSE 0 END
      + CASE WHEN contains(a.raw_author_names_lc, lower(i.full_name)) THEN 280 ELSE 0 END
      + CASE WHEN a.has_imperial_affiliation THEN 180 ELSE 0 END
      + least(coalesce(a.works_count, 0), 200) * 0.25
      + least(coalesce(a.cited_by_count, 0), 10000) * 0.002
    ) AS score,
    CASE
      WHEN i.orcid <> '' AND (
        replace(a.orcid, 'https://orcid.org/', '') = i.orcid
        OR replace(a.ids_orcid, 'https://orcid.org/', '') = i.orcid
      ) THEN 'orcid'
      WHEN a.display_name_lc = lower(i.full_name) AND a.has_imperial_affiliation THEN 'exact_name+imperial'
      WHEN contains(a.raw_author_names_lc, lower(i.full_name)) AND a.has_imperial_affiliation THEN 'raw_name+imperial'
      WHEN a.display_name_lc = lower(i.full_name) THEN 'exact_name'
      WHEN contains(a.raw_author_names_lc, lower(i.full_name)) THEN 'raw_name'
      ELSE 'other'
    END AS match_reason
  FROM imperial_unmatched_profiles_input i
  JOIN author_hits a
    ON a.display_name_lc = lower(i.full_name)
    OR contains(a.raw_author_names_lc, lower(i.full_name))
    OR (
      i.orcid <> '' AND (
        replace(a.orcid, 'https://orcid.org/', '') = i.orcid
        OR replace(a.ids_orcid, 'https://orcid.org/', '') = i.orcid
      )
    )
),
ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY researcher_id
      ORDER BY score DESC, has_imperial_affiliation DESC, works_count DESC, cited_by_count DESC, openalex_id
    ) AS candidate_rank,
    lead(score) OVER (
      PARTITION BY researcher_id
      ORDER BY score DESC, has_imperial_affiliation DESC, works_count DESC, cited_by_count DESC, openalex_id
    ) AS next_score
  FROM candidates
)
SELECT
  ord,
  researcher_id,
  profile_url,
  full_name,
  input_orcid,
  position_name,
  position,
  affiliation,
  faculty,
  fields_of_research,
  openalex_id,
  openalex_url,
  openalex_display_name,
  openalex_orcid,
  ids_orcid,
  works_count,
  cited_by_count,
  has_imperial_affiliation,
  array_join(last_known_institution_names, '; ') AS last_known_institutions,
  array_join(affiliation_names, '; ') AS affiliations,
  score,
  coalesce(next_score, 0) AS next_score,
  score - coalesce(next_score, 0) AS score_margin,
  match_reason,
  CASE
    WHEN match_reason = 'orcid' THEN 'auto'
    WHEN score >= 500 AND score - coalesce(next_score, 0) >= 80 THEN 'auto'
    WHEN score >= 360 AND has_imperial_affiliation AND score - coalesce(next_score, 0) >= 80 THEN 'auto'
    WHEN score >= 300 THEN 'review'
    ELSE 'low_confidence'
  END AS confidence_bucket
FROM ranked
WHERE candidate_rank <= 5
ORDER BY ord, candidate_rank
""".strip() + "\n", encoding="utf-8")

    print(f"Wrote {OUT_SQL}")
    print(f"Names: {len(names)}")
    print(f"ORCIDs: {len(orcids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
