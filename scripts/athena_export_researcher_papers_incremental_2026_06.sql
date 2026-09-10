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
    json_format(cast(transform(slice(w.topics, 1, 5), topic -> topic.display_name) AS json)) AS topics_json,
    w.updated_date
  FROM works_json_incremental_2026_06 w
  CROSS JOIN UNNEST(w.authorships) AS t(authorship)
  JOIN target_authors ta
    ON regexp_extract(authorship.author.id, 'A[0-9]+') = ta.openalex_id
  WHERE w.updated_date BETWEEN '2026-03-31' AND '2026-06-26'
    AND coalesce(w.publication_year, 0) >= 1970
    AND coalesce(w.display_name, w.title) IS NOT NULL
)
SELECT DISTINCT *
FROM matched
ORDER BY researcher_openalex_id, updated_date, cited_by_count DESC NULLS LAST
