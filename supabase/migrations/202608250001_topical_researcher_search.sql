begin;

create index if not exists researcher_themes_label_trgm_idx
  on public.researcher_themes
  using gin (label gin_trgm_ops);

create or replace function public.match_topic_researcher_profiles(
  query_embedding vector(1536),
  match_count int default 250,
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
  document_text text,
  paper_count int,
  papers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with nearest_profiles as materialized (
    select
      document.researcher_id,
      document.document_text,
      document.paper_count,
      1 - (document.embedding <=> query_embedding) as similarity
    from public.researcher_documents as document
    where document.embedding is not null
    -- The + 0 keeps this small profile-only search exact instead of allowing
    -- the HNSW default search breadth to silently stop at 40 candidates.
    order by (document.embedding <=> query_embedding) + 0
    limit least(greatest(match_count, 1), 300)
  )
  select
    researcher.id,
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
    nearest.similarity,
    ''::text as document_text,
    nearest.paper_count,
    '[]'::jsonb as papers
  from nearest_profiles as nearest
  join public.researchers as researcher on researcher.id = nearest.researcher_id
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
  order by nearest.similarity desc
  limit least(greatest(match_count, 1), 300);
$$;

revoke all on function public.match_topic_researcher_profiles(vector, int, text[], text[]) from public;
grant execute on function public.match_topic_researcher_profiles(vector, int, text[], text[]) to service_role;

create or replace function public.match_topic_profile_terms(
  method_query text,
  domain_query text,
  match_count int default 200,
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
  document_text text,
  paper_count int,
  papers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with queries as (
    select
      case
        when nullif(trim(method_query), '') is null then null::tsquery
        else websearch_to_tsquery('english', method_query)
      end as method_tsquery,
      case
        when nullif(trim(domain_query), '') is null then null::tsquery
        else websearch_to_tsquery('english', domain_query)
      end as domain_tsquery
  ),
  profiles as materialized (
    select
      researcher.*,
      coalesce(document.paper_count, 0) as paper_count,
      setweight(to_tsvector('english', concat_ws(' ', researcher.position_name, researcher."position")), 'A')
        || setweight(to_tsvector('english', coalesce(researcher.fields_of_research, '')), 'B')
        || setweight(to_tsvector('english', concat_ws(' ', researcher.bio_about, researcher.research)), 'C')
        as profile_vector
    from public.researchers as researcher
    left join public.researcher_documents as document on document.researcher_id = researcher.id
  ),
  matches as materialized (
    select
      profile.*,
      coalesce(ts_rank_cd(profile.profile_vector, query.method_tsquery), 0)
        + coalesce(ts_rank_cd(profile.profile_vector, query.domain_tsquery), 0) as lexical_score
    from profiles as profile
    cross join queries as query
    where (query.method_tsquery is null or profile.profile_vector @@ query.method_tsquery)
      and (query.domain_tsquery is null or profile.profile_vector @@ query.domain_tsquery)
      and (query.method_tsquery is not null or query.domain_tsquery is not null)
      and (
        faculty_filters is null
        or cardinality(faculty_filters) = 0
        or profile.faculty = any(faculty_filters)
      )
      and (
        role_filters is null
        or cardinality(role_filters) = 0
        or profile.position_name = any(role_filters)
        or profile."position" = any(role_filters)
      )
    order by lexical_score desc
    limit least(greatest(match_count, 1), 300)
  )
  select
    match.id,
    match.openalex_id,
    match.full_name,
    match.email,
    match.profile_url,
    match.bio_about,
    match.research,
    match.position_name,
    match."position",
    match.affiliation,
    match.faculty,
    match.fields_of_research,
    match.lexical_score::double precision,
    ''::text as document_text,
    match.paper_count,
    '[]'::jsonb as papers
  from matches as match
  order by match.lexical_score desc, match.full_name
  limit least(greatest(match_count, 1), 300);
$$;

revoke all on function public.match_topic_profile_terms(text, text, int, text[], text[]) from public;
grant execute on function public.match_topic_profile_terms(text, text, int, text[], text[]) to service_role;

create or replace function public.match_topical_researchers(
  query_embedding vector(1536),
  topic_query text,
  match_count int default 250,
  nearest_paper_count int default 3000,
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
  document_text text,
  paper_count int,
  papers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with nearest_paper_ids as materialized (
    select
      pd.researcher_id,
      pd.paper_id,
      1 - (pd.embedding <=> query_embedding) as paper_similarity
    from public.researcher_paper_documents as pd
    where pd.embedding is not null
    order by pd.embedding <=> query_embedding
    limit least(greatest(nearest_paper_count, 100), 1500)
  ),
  nearest_papers as materialized (
    select
      nearest.researcher_id,
      rp.id as paper_id,
      rp.openalex_work_id,
      rp.title,
      rp.abstract,
      rp.publication_year,
      rp.cited_by_count,
      rp.source_display_name,
      rp.doi,
      nearest.paper_similarity
    from nearest_paper_ids as nearest
    join public.researcher_papers as rp on rp.id = nearest.paper_id
    join public.researchers as researcher on researcher.id = nearest.researcher_id
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
  ranked_papers as (
    select
      nearest.*,
      row_number() over (
        partition by nearest.researcher_id
        order by nearest.paper_similarity desc,
          nearest.cited_by_count desc nulls last,
          nearest.publication_year desc nulls last
      ) as evidence_rank
    from nearest_papers as nearest
  ),
  paper_rollup as (
    select
      ranked.researcher_id,
      max(ranked.paper_similarity) as paper_similarity,
      avg(ranked.paper_similarity) filter (where ranked.evidence_rank <= 3) as top_paper_average,
      least(1.0, count(*)::double precision / 5.0) as paper_depth_score,
      jsonb_agg(
        jsonb_build_object(
          'paper_id', ranked.paper_id,
          'openalex_work_id', ranked.openalex_work_id,
          'title', ranked.title,
          'abstract', left(coalesce(ranked.abstract, ''), 1200),
          'publication_year', ranked.publication_year,
          'cited_by_count', ranked.cited_by_count,
          'source_display_name', ranked.source_display_name,
          'doi', ranked.doi,
          'similarity', ranked.paper_similarity
        )
        order by ranked.evidence_rank
      ) filter (where ranked.evidence_rank <= 10) as papers
    from ranked_papers as ranked
    group by ranked.researcher_id
  ),
  topic_scored as (
    select
      theme.researcher_id,
      theme.openalex_topic_id,
      theme.label,
      theme.description,
      theme.keywords,
      greatest(
        similarity(lower(theme.label), lower(coalesce(topic_query, ''))),
        similarity(lower(theme.description), lower(coalesce(topic_query, ''))) * 0.8,
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
            websearch_to_tsquery('english', coalesce(topic_query, ''))
          ) * 3.0
        )
      )::double precision as topic_similarity
    from paper_rollup as paper_candidate
    join public.researcher_themes as theme on theme.researcher_id = paper_candidate.researcher_id
    where theme.source_type = 'openalex_topic'
  ),
  ranked_topics as (
    select
      topic.*,
      row_number() over (
        partition by topic.researcher_id
        order by topic.topic_similarity desc, topic.label
      ) as topic_rank
    from topic_scored as topic
    where topic.topic_similarity >= 0.08
  ),
  best_topic as (
    select *
    from ranked_topics
    where topic_rank = 1
  ),
  candidate_ids as (
    select researcher_id from paper_rollup
  ),
  candidates as (
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
      case
        when document.embedding is null then 0::double precision
        else 1 - (document.embedding <=> query_embedding)
      end as profile_similarity,
      coalesce(papers.paper_similarity, 0)::double precision as paper_similarity,
      coalesce(papers.top_paper_average, 0)::double precision as top_paper_average,
      coalesce(papers.paper_depth_score, 0)::double precision as paper_depth_score,
      coalesce(topic.topic_similarity, 0)::double precision as topic_similarity,
      topic.label as topic_label,
      topic.description as topic_description,
      coalesce(topic.keywords, '{}'::text[]) as topic_keywords,
      topic.openalex_topic_id,
      coalesce(document.document_text, '') as document_text,
      coalesce(document.paper_count, 0) as paper_count,
      coalesce(papers.papers, '[]'::jsonb) as papers
    from candidate_ids as candidate
    join public.researchers as researcher on researcher.id = candidate.researcher_id
    left join public.researcher_documents as document on document.researcher_id = candidate.researcher_id
    left join paper_rollup as papers on papers.researcher_id = candidate.researcher_id
    left join best_topic as topic on topic.researcher_id = candidate.researcher_id
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
    greatest(
      candidate.paper_similarity * 0.76
        + candidate.top_paper_average * 0.10
        + candidate.paper_depth_score * 0.06
        + candidate.profile_similarity * 0.08,
      candidate.topic_similarity * 0.68
        + candidate.paper_similarity * 0.20
        + candidate.profile_similarity * 0.12
    ) as similarity,
    candidate.profile_similarity,
    candidate.paper_similarity,
    candidate.paper_depth_score,
    candidate.topic_similarity,
    candidate.topic_label,
    candidate.topic_description,
    candidate.topic_keywords,
    candidate.openalex_topic_id,
    candidate.document_text,
    candidate.paper_count,
    candidate.papers
  from candidates as candidate
  order by similarity desc, candidate.paper_depth_score desc, candidate.full_name
  limit least(greatest(match_count, 1), 500);
$$;

revoke all on function public.match_topical_researchers(vector, text, int, int, text[], text[]) from public;
grant execute on function public.match_topical_researchers(vector, text, int, int, text[], text[]) to service_role;

commit;
