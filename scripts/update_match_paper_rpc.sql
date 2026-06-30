create or replace function public.match_researcher_paper_documents(
  query_embedding vector(1536),
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
  paper_id uuid,
  openalex_work_id text,
  title text,
  abstract text,
  publication_year int,
  cited_by_count int,
  source_display_name text
)
language sql
stable
as $$
  with nearest_papers as materialized (
    select
      pd.paper_id,
      pd.researcher_id,
      1 - (pd.embedding <=> query_embedding) as similarity
    from public.researcher_paper_documents pd
    where pd.embedding is not null
    order by pd.embedding <=> query_embedding
    limit match_count
  )
  select
    r.id as researcher_id,
    r.openalex_id,
    r.full_name,
    r.email,
    r.profile_url,
    r.bio_about,
    r.research,
    r.position_name,
    r."position",
    r.affiliation,
    r.faculty,
    r.fields_of_research,
    np.similarity,
    rp.id as paper_id,
    rp.openalex_work_id,
    rp.title,
    rp.abstract,
    rp.publication_year,
    rp.cited_by_count,
    rp.source_display_name
  from nearest_papers np
  join public.researcher_papers rp on rp.id = np.paper_id
  join public.researchers r on r.id = np.researcher_id
  where (faculty_filters is null or cardinality(faculty_filters) = 0 or r.faculty = any(faculty_filters))
    and (
      role_filters is null
      or cardinality(role_filters) = 0
      or r.position_name = any(role_filters)
      or r."position" = any(role_filters)
    )
  order by np.similarity desc
  limit match_count;
$$;
