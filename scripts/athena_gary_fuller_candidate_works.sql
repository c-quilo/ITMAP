WITH target_authors(openalex_id) AS (
  VALUES
    ('A5116444030'),
    ('A5094226448'),
    ('A5114138974'),
    ('A5125049927'),
    ('A5106787541')
),
matched AS (
  SELECT
    ta.openalex_id AS author_id,
    regexp_extract(w.id, 'W[0-9]+') AS openalex_work_id,
    coalesce(w.display_name, w.title) AS title,
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
SELECT *
FROM matched
ORDER BY author_id, cited_by_count DESC NULLS LAST, publication_year DESC NULLS LAST
