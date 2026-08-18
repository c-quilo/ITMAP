WITH target_authors AS (
  SELECT DISTINCT openalex_id
  FROM imperial_profiles_input
  WHERE openalex_id IS NOT NULL AND openalex_id <> ''
),
raw_topics AS (
  SELECT DISTINCT
    ta.openalex_id AS researcher_openalex_id,
    regexp_extract(w.id, 'W[0-9]+') AS openalex_work_id,
    coalesce(w.display_name, w.title) AS title,
    w.publication_year,
    coalesce(w.cited_by_count, 0) AS cited_by_count,
    regexp_extract(topic.id, 'T[0-9]+') AS openalex_topic_id,
    topic.display_name AS topic_name,
    greatest(coalesce(topic.score, 0.0), 0.0) AS topic_score
  FROM works_json_full w
  CROSS JOIN UNNEST(w.authorships) AS author_rows(authorship)
  JOIN target_authors ta
    ON regexp_extract(authorship.author.id, 'A[0-9]+') = ta.openalex_id
  CROSS JOIN UNNEST(slice(w.topics, 1, 3)) AS topic_rows(topic)
  WHERE coalesce(w.display_name, w.title) IS NOT NULL
    AND w.publication_year >= 1970
    AND topic.id IS NOT NULL
    AND topic.display_name IS NOT NULL
),
weighted_topics AS (
  SELECT
    raw_topics.*,
    CASE
      WHEN sum(topic_score) OVER (PARTITION BY researcher_openalex_id, openalex_work_id) > 0
        THEN topic_score / sum(topic_score) OVER (PARTITION BY researcher_openalex_id, openalex_work_id)
      ELSE 1.0 / count(*) OVER (PARTITION BY researcher_openalex_id, openalex_work_id)
    END AS paper_weight
  FROM raw_topics
),
author_totals AS (
  SELECT
    researcher_openalex_id,
    count(DISTINCT openalex_work_id) AS total_papers
  FROM weighted_topics
  GROUP BY researcher_openalex_id
),
topic_rollup AS (
  SELECT
    researcher_openalex_id,
    openalex_topic_id,
    topic_name,
    count(DISTINCT openalex_work_id) AS paper_count,
    sum(paper_weight) AS topic_weight,
    avg(topic_score) AS average_topic_score,
    min(publication_year) AS first_year,
    max(publication_year) AS latest_year,
    count(DISTINCT CASE
      WHEN publication_year >= year(current_date) - 5 THEN openalex_work_id
    END) AS recent_paper_count,
    sum(CASE
      WHEN publication_year >= year(current_date) - 5 THEN paper_weight ELSE 0
    END) AS recent_weight,
    sum(CASE
      WHEN publication_year >= year(current_date) - 10
        AND publication_year < year(current_date) - 5 THEN paper_weight ELSE 0
    END) AS prior_weight,
    slice(
      array_agg(
        cast(
          row(openalex_work_id, title, publication_year, cited_by_count, topic_score)
          AS row(
            openalex_work_id varchar,
            title varchar,
            publication_year integer,
            cited_by_count bigint,
            relevance double
          )
        )
        ORDER BY topic_score DESC, publication_year DESC, cited_by_count DESC
      ),
      1,
      5
    ) AS representative_papers
  FROM weighted_topics
  GROUP BY researcher_openalex_id, openalex_topic_id, topic_name
),
ranked_topics AS (
  SELECT
    topic_rollup.*,
    author_totals.total_papers,
    row_number() OVER (
      PARTITION BY topic_rollup.researcher_openalex_id
      ORDER BY
        topic_rollup.topic_weight / author_totals.total_papers DESC,
        topic_rollup.recent_weight DESC,
        topic_rollup.paper_count DESC,
        topic_rollup.topic_name
    ) AS topic_rank
  FROM topic_rollup
  JOIN author_totals
    ON author_totals.researcher_openalex_id = topic_rollup.researcher_openalex_id
)
SELECT
  researcher_openalex_id,
  openalex_topic_id,
  topic_name,
  topic_rank,
  paper_count,
  total_papers,
  topic_weight / total_papers AS topic_strength,
  cast(paper_count AS double) / total_papers AS paper_share,
  average_topic_score,
  first_year,
  latest_year,
  recent_paper_count,
  CASE
    WHEN recent_weight >= greatest(1.5, prior_weight * 1.25) THEN 'emerging'
    WHEN prior_weight >= 1.5 AND recent_weight <= prior_weight * 0.65 THEN 'declining'
    WHEN paper_count < 3 THEN 'insufficient_data'
    ELSE 'stable'
  END AS trend,
  json_format(cast(representative_papers AS json)) AS representative_papers_json
FROM ranked_topics
WHERE topic_rank <= 12
ORDER BY researcher_openalex_id, topic_rank
