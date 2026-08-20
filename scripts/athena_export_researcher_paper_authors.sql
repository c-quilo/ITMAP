WITH target_authors AS (
  SELECT DISTINCT openalex_id
  FROM imperial_profiles_input
  WHERE openalex_id IS NOT NULL AND openalex_id <> ''
),
matched_works AS (
  SELECT
    ta.openalex_id AS researcher_openalex_id,
    regexp_extract(w.id, 'W[0-9]+') AS openalex_work_id,
    coalesce(w.display_name, w.title) AS title,
    w.publication_year,
    w.cited_by_count,
    w.authorships
  FROM works_json w
  CROSS JOIN UNNEST(w.authorships) AS focal(author_ship)
  JOIN target_authors ta
    ON regexp_extract(focal.author_ship.author.id, 'A[0-9]+') = ta.openalex_id
  WHERE coalesce(w.display_name, w.title) IS NOT NULL
)
SELECT
  mw.researcher_openalex_id,
  mw.openalex_work_id,
  mw.title,
  mw.publication_year,
  mw.cited_by_count,
  regexp_extract(coauthor.author.id, 'A[0-9]+') AS coauthor_openalex_id,
  coauthor.author.display_name AS coauthor_name,
  json_format(cast(transform(coauthor.institutions, institution -> institution.id) AS json)) AS institution_ids_json,
  json_format(cast(transform(coauthor.institutions, institution -> institution.display_name) AS json)) AS institution_names_json
FROM matched_works mw
CROSS JOIN UNNEST(mw.authorships) AS co(coauthor)
WHERE regexp_extract(coauthor.author.id, 'A[0-9]+') <> mw.researcher_openalex_id
  AND regexp_extract(coauthor.author.id, 'A[0-9]+') IS NOT NULL
  AND coauthor.author.display_name IS NOT NULL
ORDER BY mw.researcher_openalex_id, mw.cited_by_count DESC NULLS LAST, mw.publication_year DESC NULLS LAST
