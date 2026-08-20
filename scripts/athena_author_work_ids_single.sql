SELECT
  regexp_extract(w.id, 'W[0-9]+') AS openalex_work_id,
  coalesce(w.display_name, w.title) AS title,
  w.publication_year,
  w.doi,
  w.primary_location.source.display_name AS source_display_name
FROM works_json w
CROSS JOIN UNNEST(w.authorships) AS t(authorship)
WHERE regexp_extract(authorship.author.id, 'A[0-9]+') = 'A5091225601'
ORDER BY w.publication_year DESC NULLS LAST, openalex_work_id
