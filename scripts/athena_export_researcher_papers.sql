WITH target_authors AS (
  SELECT DISTINCT openalex_id
  FROM imperial_profiles_input
  WHERE openalex_id IS NOT NULL AND openalex_id <> ''
),
matched AS (
  SELECT
    ta.openalex_id AS researcher_openalex_id,
    regexp_extract(w.id, 'W[0-9]+') AS openalex_work_id,
    w.id AS openalex_work_url,
    coalesce(w.display_name, w.title) AS title,
    json_format(cast(w.abstract_inverted_index AS json)) AS abstract_inverted_index_json,
    w.publication_year,
    w.cited_by_count,
    w.primary_location.source.display_name AS source_display_name,
    w.doi,
    transform(slice(w.topics, 1, 5), topic -> topic.display_name) AS topics
  FROM works_json w
  CROSS JOIN UNNEST(w.authorships) AS t(authorship)
  JOIN target_authors ta
    ON regexp_extract(authorship.author.id, 'A[0-9]+') = ta.openalex_id
  WHERE coalesce(w.display_name, w.title) IS NOT NULL
)
SELECT
  matched.*
FROM matched
ORDER BY researcher_openalex_id, cited_by_count DESC NULLS LAST, publication_year DESC NULLS LAST
