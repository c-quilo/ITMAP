SELECT
  count(*) AS work_count,
  count_if(cardinality(authorships) > 0) AS works_with_authors,
  min(updated_date) AS first_updated_date,
  max(updated_date) AS last_updated_date
FROM works_json_incremental_2026_06
WHERE updated_date = '2026-04-20'
