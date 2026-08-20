#!/usr/bin/env python3
from __future__ import annotations

import csv
import re
from pathlib import Path


INPUT_CSV = Path("/Users/caq13/Documents/ITMAP/imperial_profiles_unmatched_athena_input.csv")
OUT_SQL = Path("/Users/caq13/Documents/ITMAP/scripts/athena_match_unmatched_author_candidates_variants.sql")


TITLE_WORDS = {
    "dr",
    "mr",
    "mrs",
    "ms",
    "miss",
    "prof",
    "professor",
    "sir",
    "dame",
}
SUFFIX_WORDS = {
    "mbe",
    "obe",
    "cbe",
    "frcp",
    "fmedsci",
    "frs",
    "phd",
    "md",
}


def sql_quote(value: str) -> str:
    return "'" + (value or "").replace("'", "''") + "'"


def words(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (value or "").lower())
    tokens = [token for token in tokens if token not in TITLE_WORDS and token not in SUFFIX_WORDS]
    return tokens


def first_last_key(value: str) -> str:
    tokens = words(value)
    if len(tokens) < 2:
        return ""
    return f"{tokens[0]} {tokens[-1]}"


def main() -> int:
    exact_names = set()
    first_last_keys = set()
    orcids = set()
    with INPUT_CSV.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("full_name") or "").strip().lower()
            if name and name != "#name?":
                exact_names.add(name)
                key = first_last_key(name)
                if key:
                    first_last_keys.add(key)
            orcid = (row.get("orcid") or "").strip()
            if orcid:
                orcids.add(orcid)

    exact_name_values = ",\n    ".join(sql_quote(name) for name in sorted(exact_names))
    first_last_values = ",\n    ".join(sql_quote(name) for name in sorted(first_last_keys))
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
    regexp_replace(lower(display_name), '[^[:alnum:]]+', ' ') AS display_name_norm,
    regexp_extract(regexp_replace(lower(display_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1) AS author_first,
    regexp_extract(regexp_replace(lower(display_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1) AS author_last,
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
    {exact_name_values}
  )
  OR concat(
    regexp_extract(regexp_replace(lower(display_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1),
    ' ',
    regexp_extract(regexp_replace(lower(display_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1)
  ) IN (
    {first_last_values}
  )
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
    regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1) AS input_first,
    regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1) AS input_last,
    (
      CASE
        WHEN i.orcid <> '' AND (
          replace(a.orcid, 'https://orcid.org/', '') = i.orcid
          OR replace(a.ids_orcid, 'https://orcid.org/', '') = i.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN a.display_name_lc = lower(i.full_name) THEN 300 ELSE 0 END
      + CASE
          WHEN concat(a.author_first, ' ', a.author_last) = concat(
            regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1),
            ' ',
            regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1)
          ) THEN 230 ELSE 0
        END
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
      WHEN a.display_name_lc = lower(i.full_name) THEN 'exact_name'
      WHEN concat(a.author_first, ' ', a.author_last) = concat(
        regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1),
        ' ',
        regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1)
      ) AND a.has_imperial_affiliation THEN 'first_last+imperial'
      WHEN concat(a.author_first, ' ', a.author_last) = concat(
        regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1),
        ' ',
        regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1)
      ) THEN 'first_last'
      ELSE 'other'
    END AS match_reason
  FROM imperial_unmatched_profiles_input i
  JOIN author_hits a
    ON a.display_name_lc = lower(i.full_name)
    OR concat(a.author_first, ' ', a.author_last) = concat(
      regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '^ *([^ ]+)', 1),
      ' ',
      regexp_extract(regexp_replace(lower(i.full_name), '[^[:alnum:]]+', ' '), '([^ ]+) *$', 1)
    )
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
    WHEN match_reason IN ('exact_name+imperial', 'first_last+imperial') AND score - coalesce(next_score, 0) >= 50 THEN 'auto'
    WHEN match_reason IN ('exact_name+imperial', 'first_last+imperial') THEN 'review'
    WHEN score >= 330 AND score - coalesce(next_score, 0) >= 100 THEN 'review'
    ELSE 'low_confidence'
  END AS confidence_bucket
FROM ranked
WHERE candidate_rank <= 5
ORDER BY ord, candidate_rank
""".strip() + "\n", encoding="utf-8")

    print(f"Wrote {OUT_SQL}")
    print(f"Exact names: {len(exact_names)}")
    print(f"First-last keys: {len(first_last_keys)}")
    print(f"ORCIDs: {len(orcids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
