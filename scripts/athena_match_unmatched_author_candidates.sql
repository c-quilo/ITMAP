WITH input AS (
  SELECT
    ord,
    researcher_id,
    profile_url,
    full_name,
    orcid,
    position_name,
    position,
    affiliation,
    faculty,
    fields_of_research,
    profile_text,
    lower(regexp_replace(full_name, '[^[:alnum:]]+', ' ')) AS name_norm,
    lower(regexp_replace(profile_text, '[^[:alnum:]]+', ' ')) AS profile_norm
  FROM imperial_unmatched_profiles_input
  WHERE full_name IS NOT NULL
    AND full_name <> ''
    AND full_name <> '#NAME?'
),
authors_base AS (
  SELECT
    regexp_extract(id, 'A[0-9]+') AS openalex_id,
    id AS openalex_url,
    display_name,
    orcid,
    ids.orcid AS ids_orcid,
    works_count,
    cited_by_count,
    last_known_institutions,
    affiliations,
    lower(regexp_replace(display_name, '[^[:alnum:]]+', ' ')) AS author_name_norm,
    any_match(
      last_known_institutions,
      inst -> inst.id = 'https://openalex.org/I47508984' OR inst.id = 'I47508984'
    )
    OR any_match(
      affiliations,
      aff -> aff.institution.id = 'https://openalex.org/I47508984' OR aff.institution.id = 'I47508984'
    ) AS has_imperial_affiliation
  FROM authors_json
  WHERE display_name IS NOT NULL
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
          a.orcid = concat('https://orcid.org/', i.orcid)
          OR a.orcid = i.orcid
          OR a.ids_orcid = concat('https://orcid.org/', i.orcid)
          OR a.ids_orcid = i.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN a.author_name_norm = i.name_norm THEN 300 ELSE 0 END
      + CASE WHEN a.has_imperial_affiliation THEN 180 ELSE 0 END
      + CASE WHEN lower(a.display_name) = lower(i.full_name) THEN 80 ELSE 0 END
      + CASE WHEN regexp_like(i.profile_norm, 'air pollution|air quality|environmental exposure') AND regexp_like(lower(a.display_name), 'gary fuller') THEN 60 ELSE 0 END
      + least(coalesce(a.works_count, 0), 200) * 0.25
      + least(coalesce(a.cited_by_count, 0), 10000) * 0.002
    ) AS score,
    CASE
      WHEN i.orcid <> '' AND (
        a.orcid = concat('https://orcid.org/', i.orcid)
        OR a.orcid = i.orcid
        OR a.ids_orcid = concat('https://orcid.org/', i.orcid)
        OR a.ids_orcid = i.orcid
      ) THEN 'orcid'
      WHEN a.author_name_norm = i.name_norm AND a.has_imperial_affiliation THEN 'exact_name+imperial'
      WHEN a.author_name_norm = i.name_norm THEN 'exact_name'
      ELSE 'other'
    END AS match_reason
  FROM input i
  JOIN authors_base a
    ON a.author_name_norm = i.name_norm
    OR (
      i.orcid <> '' AND (
        a.orcid = concat('https://orcid.org/', i.orcid)
        OR a.orcid = i.orcid
        OR a.ids_orcid = concat('https://orcid.org/', i.orcid)
        OR a.ids_orcid = i.orcid
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
