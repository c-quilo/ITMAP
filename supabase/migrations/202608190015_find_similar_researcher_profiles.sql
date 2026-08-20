begin;

create or replace function public.find_similar_researcher_profiles(
  p_researcher_id uuid,
  p_match_count int default 5
)
returns table (
  researcher_id uuid,
  profile_url text,
  openalex_id text,
  full_name text,
  title text,
  department text,
  faculty text,
  fields_of_research text,
  similarity double precision,
  paper_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with source_profile as (
    select
      researcher.id,
      researcher.full_name,
      public.openalex_author_key(researcher.openalex_id) as openalex_id,
      document.embedding
    from public.researchers as researcher
    join public.researcher_documents as document
      on document.researcher_id = researcher.id
    where researcher.id = p_researcher_id
      and document.embedding is not null
  )
  select
    candidate.id as researcher_id,
    candidate.profile_url,
    candidate.openalex_id,
    candidate.full_name,
    coalesce(candidate.position_name, candidate."position", 'Imperial researcher') as title,
    coalesce(candidate.affiliation, '') as department,
    coalesce(candidate.faculty, '') as faculty,
    coalesce(candidate.fields_of_research, '') as fields_of_research,
    1 - (candidate_document.embedding <=> source.embedding) as similarity,
    candidate_document.paper_count
  from source_profile as source
  join public.researcher_documents as candidate_document
    on candidate_document.researcher_id <> source.id
    and candidate_document.embedding is not null
  join public.researchers as candidate
    on candidate.id = candidate_document.researcher_id
  where coalesce(candidate.position_name, candidate."position", '') not ilike '%visiting%'
    and lower(trim(candidate.full_name)) <> lower(trim(source.full_name))
    and (
      source.openalex_id = ''
      or public.openalex_author_key(candidate.openalex_id) = ''
      or public.openalex_author_key(candidate.openalex_id) <> source.openalex_id
    )
    and not exists (
      select 1
      from public.researcher_openalex_aliases as source_alias
      join public.researcher_openalex_aliases as candidate_alias
        on candidate_alias.openalex_id = source_alias.openalex_id
      where source_alias.researcher_id = source.id
        and candidate_alias.researcher_id = candidate.id
    )
  order by candidate_document.embedding <=> source.embedding, candidate.full_name
  limit greatest(3, least(coalesce(p_match_count, 5), 5));
$$;

revoke all on function public.find_similar_researcher_profiles(uuid, int) from public;
grant execute on function public.find_similar_researcher_profiles(uuid, int) to service_role;

comment on function public.find_similar_researcher_profiles(uuid, int) is
  'Returns three to five nearest Imperial researcher profiles using existing profile embeddings.';

commit;
