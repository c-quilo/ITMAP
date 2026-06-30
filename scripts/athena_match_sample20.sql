
WITH sample(ord, full_name, orcid) AS (
  VALUES
    (1, 'Dania Badran', ''),
    (2, 'Utkarsh Ojha', ''),
    (3, 'Daniela Rodrigues', ''),
    (4, 'Martin Williams', ''),
    (5, 'John Mumford', ''),
    (6, 'Sophie Helaine', '0000-0002-9877-4180'),
    (7, 'Francesc Fabregas Flavia', '0000-0003-0745-7284'),
    (8, 'Sabine van Elsland', '0000-0003-0775-7463'),
    (9, 'Peter Du', ''),
    (10, 'Richard Szydlo', ''),
    (11, 'Norbert Klein', ''),
    (12, 'Jon Lloyd', ''),
    (13, 'Aula Abbara', '0000-0002-7049-8399'),
    (14, 'Navaratnarajah Kuganathan', '0000-0002-4826-5329'),
    (15, 'Abu Taher Muhammad Abdullah', ''),
    (16, 'Abd Al Rahman Abu Ebayyeh', ''),
    (17, 'Kate Mitchell', '0000-0002-7050-4787'),
    (18, 'Atula Abeysekera', ''),
    (19, 'Mike Warner', '0000-0002-1858-218X'),
    (20, 'Arkhat Abzhanov', '')
),
candidates AS (
  SELECT
    s.ord,
    s.full_name,
    s.orcid AS input_orcid,
    ia.openalex_id,
    ia.openalex_url,
    ia.display_name AS openalex_display_name,
    ia.orcid AS openalex_orcid,
    ia.works_count,
    ia.cited_by_count,
    (
      CASE
        WHEN s.orcid <> '' AND (
          ia.orcid = concat('https://orcid.org/', s.orcid)
          OR ia.orcid = s.orcid
          OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
          OR ia.ids_orcid = s.orcid
        ) THEN 1000 ELSE 0
      END
      + CASE WHEN lower(ia.display_name) = lower(s.full_name) THEN 250 ELSE 0 END
      + least(coalesce(ia.works_count, 0), 200)
    ) AS score,
    CASE
      WHEN s.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', s.orcid)
        OR ia.orcid = s.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
        OR ia.ids_orcid = s.orcid
      ) THEN 'orcid+imperial'
      WHEN lower(ia.display_name) = lower(s.full_name) THEN 'exact_name+imperial'
      ELSE 'other'
    END AS match_reason
  FROM sample s
  JOIN imperial_authors ia
    ON lower(ia.display_name) = lower(s.full_name)
    OR (
      s.orcid <> '' AND (
        ia.orcid = concat('https://orcid.org/', s.orcid)
        OR ia.orcid = s.orcid
        OR ia.ids_orcid = concat('https://orcid.org/', s.orcid)
        OR ia.ids_orcid = s.orcid
      )
    )
),
best AS (
  SELECT *
  FROM (
    SELECT
      candidates.*,
      row_number() OVER (
        PARTITION BY ord
        ORDER BY score DESC, works_count DESC, cited_by_count DESC, openalex_id
      ) AS rn
    FROM candidates
  )
  WHERE rn = 1
)
SELECT
  s.ord,
  s.full_name,
  coalesce(b.openalex_id, '') AS openalex_id,
  coalesce(b.openalex_url, '') AS openalex_url,
  coalesce(b.openalex_display_name, '') AS openalex_display_name,
  coalesce(b.openalex_orcid, '') AS openalex_orcid,
  coalesce(cast(b.works_count AS varchar), '') AS works_count,
  coalesce(cast(b.cited_by_count AS varchar), '') AS cited_by_count,
  coalesce(cast(b.score AS varchar), '') AS score,
  coalesce(b.match_reason, '') AS match_reason
FROM sample s
LEFT JOIN best b ON s.ord = b.ord
ORDER BY s.ord
