begin;

create or replace function public.match_openalex_topic_researchers(
  topic_query text,
  match_count int default 400,
  faculty_filters text[] default null,
  role_filters text[] default null
)
returns table (
  researcher_id uuid,
  openalex_id text,
  full_name text,
  email text,
  profile_url text,
  bio_about text,
  research text,
  position_name text,
  "position" text,
  affiliation text,
  faculty text,
  fields_of_research text,
  similarity double precision,
  profile_similarity double precision,
  paper_similarity double precision,
  paper_depth_score double precision,
  topic_similarity double precision,
  topic_label text,
  topic_description text,
  topic_keywords text[],
  openalex_topic_id text,
  openalex_topics jsonb,
  document_text text,
  paper_count int,
  papers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with query_input as (
    select
      lower(trim(coalesce(topic_query, ''))) as normalized_query,
      websearch_to_tsquery('english', coalesce(topic_query, '')) as topic_tsquery
  ),
  matching_themes as materialized (
    select
      theme.*,
      greatest(
        case
          when lower(theme.label) = query.normalized_query then 1.0
          when lower(theme.label) like '%' || query.normalized_query || '%' then 0.92
          else 0.0
        end,
        similarity(lower(theme.label), query.normalized_query),
        similarity(lower(theme.description), query.normalized_query) * 0.78,
        least(
          1.0,
          ts_rank_cd(
            to_tsvector(
              'english',
              concat_ws(
                ' ',
                theme.label,
                theme.description,
                array_to_string(theme.keywords, ' '),
                theme.domain_name,
                theme.field_name,
                theme.subfield_name
              )
            ),
            query.topic_tsquery
          ) * 4.5
        )
      )::double precision as lexical_score
    from public.researcher_themes as theme
    cross join query_input as query
    where theme.source_type = 'openalex_topic'
      and query.normalized_query <> ''
      and (
        to_tsvector(
          'english',
          concat_ws(
            ' ',
            theme.label,
            theme.description,
            array_to_string(theme.keywords, ' '),
            theme.domain_name,
            theme.field_name,
            theme.subfield_name
          )
        ) @@ query.topic_tsquery
        or similarity(lower(theme.label), query.normalized_query) >= 0.18
        or similarity(lower(theme.description), query.normalized_query) >= 0.12
      )
  ),
  ranked_themes as (
    select
      theme.*,
      row_number() over (
        partition by theme.researcher_id
        order by
          theme.lexical_score desc,
          theme.topic_strength desc,
          theme.paper_count desc,
          theme.latest_year desc nulls last,
          theme.label
      ) as topic_rank
    from matching_themes as theme
    where theme.lexical_score >= 0.08
  ),
  best_topic as materialized (
    select *
    from ranked_themes
    where topic_rank = 1
  ),
  topic_rollup as materialized (
    select
      ranked.researcher_id,
      jsonb_agg(
        jsonb_build_object(
          'openalex_topic_id', ranked.openalex_topic_id,
          'label', ranked.label,
          'description', ranked.description,
          'keywords', ranked.keywords,
          'domain_name', ranked.domain_name,
          'field_name', ranked.field_name,
          'subfield_name', ranked.subfield_name,
          'topic_strength', ranked.topic_strength,
          'paper_count', ranked.paper_count,
          'recent_paper_count', ranked.recent_paper_count,
          'latest_year', ranked.latest_year,
          'trend', ranked.trend,
          'relevance', ranked.lexical_score
        )
        order by ranked.topic_rank
      ) filter (where ranked.topic_rank <= 8) as openalex_topics
    from ranked_themes as ranked
    group by ranked.researcher_id
  ),
  candidates as materialized (
    select
      researcher.id as researcher_id,
      researcher.openalex_id,
      researcher.full_name,
      researcher.email,
      researcher.profile_url,
      researcher.bio_about,
      researcher.research,
      researcher.position_name,
      researcher."position",
      researcher.affiliation,
      researcher.faculty,
      researcher.fields_of_research,
      coalesce(document.document_text, '') as document_text,
      coalesce(document.paper_count, 0) as paper_count,
      0::double precision as profile_similarity,
      best.lexical_score as best_lexical_score,
      coalesce(best.topic_strength, 0)::double precision as best_topic_strength,
      coalesce(best.paper_count, 0) as best_topic_paper_count,
      coalesce(best.recent_paper_count, 0) as best_topic_recent_paper_count,
      best.latest_year as best_topic_latest_year,
      best.trend as best_topic_trend,
      best.openalex_topic_id as best_openalex_topic_id,
      best.label as best_topic_label,
      best.description as best_topic_description,
      coalesce(best.keywords, '{}'::text[]) as best_topic_keywords,
      coalesce(topic.openalex_topics, '[]'::jsonb) as openalex_topics,
      coalesce(best.representative_paper_ids, '{}'::uuid[]) as representative_paper_ids
    from best_topic as best
    join topic_rollup as topic on topic.researcher_id = best.researcher_id
    join public.researchers as researcher on researcher.id = best.researcher_id
    left join public.researcher_documents as document on document.researcher_id = researcher.id
    where (
        faculty_filters is null
        or cardinality(faculty_filters) = 0
        or researcher.faculty = any(faculty_filters)
      )
      and (
        role_filters is null
        or cardinality(role_filters) = 0
        or researcher.position_name = any(role_filters)
        or researcher."position" = any(role_filters)
      )
  ),
  scored_candidates as materialized (
    select
      candidate.*,
      least(
        1.0,
        candidate.best_lexical_score * 0.72
          + least(1.0, candidate.best_topic_strength * 3.0) * 0.14
          + least(1.0, ln(1 + candidate.best_topic_paper_count) / ln(16.0)) * 0.09
          + least(1.0, candidate.best_topic_recent_paper_count::double precision / 5.0) * 0.05
      ) as topic_retrieval_score
    from candidates as candidate
  )
  select
    candidate.researcher_id,
    candidate.openalex_id,
    candidate.full_name,
    candidate.email,
    candidate.profile_url,
    candidate.bio_about,
    candidate.research,
    candidate.position_name,
    candidate."position",
    candidate.affiliation,
    candidate.faculty,
    candidate.fields_of_research,
    candidate.topic_retrieval_score as similarity,
    candidate.profile_similarity,
    candidate.topic_retrieval_score as paper_similarity,
    least(1.0, candidate.best_topic_paper_count::double precision / 5.0) as paper_depth_score,
    candidate.best_lexical_score as topic_similarity,
    candidate.best_topic_label as topic_label,
    candidate.best_topic_description as topic_description,
    candidate.best_topic_keywords as topic_keywords,
    candidate.best_openalex_topic_id as openalex_topic_id,
    candidate.openalex_topics,
    candidate.document_text,
    candidate.paper_count,
    coalesce(evidence.papers, '[]'::jsonb) as papers
  from scored_candidates as candidate
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'paper_id', paper.id,
        'openalex_work_id', paper.openalex_work_id,
        'title', paper.title,
        'abstract', left(coalesce(paper.abstract, ''), 1200),
        'publication_year', paper.publication_year,
        'cited_by_count', paper.cited_by_count,
        'source_display_name', paper.source_display_name,
        'doi', paper.doi,
        'similarity', candidate.topic_retrieval_score
      )
      order by representative.ordinality
    ) as papers
    from unnest(candidate.representative_paper_ids) with ordinality as representative(paper_id, ordinality)
    join public.researcher_papers as paper
      on paper.id = representative.paper_id
      and paper.researcher_id = candidate.researcher_id
  ) as evidence on true
  order by
    candidate.topic_retrieval_score desc,
    candidate.best_topic_paper_count desc,
    candidate.full_name
  limit least(greatest(match_count, 1), 500);
$$;

revoke all on function public.match_openalex_topic_researchers(text, int, text[], text[]) from public;
grant execute on function public.match_openalex_topic_researchers(text, int, text[], text[]) to service_role;

commit;
