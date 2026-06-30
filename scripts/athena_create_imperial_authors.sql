CREATE TABLE imperial_authors
WITH (
  format = 'PARQUET',
  external_location = 's3://openalex-june-2026/athena-derived/imperial_authors/'
) AS
SELECT
  regexp_extract(id, 'A[0-9]+') AS openalex_id,
  id AS openalex_url,
  display_name,
  orcid,
  ids.openalex AS ids_openalex,
  ids.orcid AS ids_orcid,
  works_count,
  cited_by_count,
  last_known_institutions,
  affiliations
FROM authors_json
WHERE
  any_match(
    last_known_institutions,
    inst -> inst.id = 'https://openalex.org/I47508984' OR inst.id = 'I47508984'
  )
  OR any_match(
    affiliations,
    aff -> aff.institution.id = 'https://openalex.org/I47508984' OR aff.institution.id = 'I47508984'
  )
