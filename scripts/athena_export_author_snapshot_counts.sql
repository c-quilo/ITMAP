WITH target_authors AS (
  SELECT DISTINCT openalex_id
  FROM imperial_profiles_input
  WHERE openalex_id IS NOT NULL AND openalex_id <> ''
),
snapshot_authors AS (
  SELECT
    regexp_extract(id, 'A[0-9]+') AS openalex_id,
    max(display_name) AS snapshot_display_name,
    max(works_count) AS snapshot_works_count,
    max(cited_by_count) AS snapshot_cited_by_count
  FROM authors_json
  WHERE regexp_extract(id, 'A[0-9]+') IN (SELECT openalex_id FROM target_authors)
  GROUP BY 1
)
SELECT
  ta.openalex_id,
  sa.snapshot_display_name,
  sa.snapshot_works_count,
  sa.snapshot_cited_by_count
FROM target_authors ta
LEFT JOIN snapshot_authors sa
  ON ta.openalex_id = sa.openalex_id
ORDER BY ta.openalex_id
