create index if not exists researcher_documents_fts_idx
  on public.researcher_documents
  using gin (to_tsvector('english', coalesce(document_text, '')));

create index if not exists researcher_paper_documents_fts_idx
  on public.researcher_paper_documents
  using gin (to_tsvector('english', coalesce(document_text, '')));

alter table public.researcher_documents
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(document_text, ''))) stored;

create index if not exists researcher_documents_search_vector_idx
  on public.researcher_documents
  using gin (search_vector);

create or replace function public.match_keyword_researchers(
  search_query text,
  match_count int default 80,
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
  papers jsonb,
  keyword_profile_rank double precision,
  keyword_paper_rank double precision
)
language sql
stable
as $$
  with query as (
    select
      case
        when search_query ~* '\m(AND|OR|NOT)\M|["-]'
          then websearch_to_tsquery('english', search_query)
        when array_length(regexp_split_to_array(trim(search_query), '\s+'), 1) between 2 and 5
          then phraseto_tsquery('english', search_query)
        else websearch_to_tsquery('english', search_query)
      end as tsq
  ),
  profile_hits as materialized (
    select
      d.researcher_id,
      ts_rank_cd(
        d.search_vector,
        query.tsq,
        32
      ) as profile_rank
    from public.researcher_documents d
    cross join query
    where query.tsq <> ''::tsquery
      and d.search_vector @@ query.tsq
    order by profile_rank desc
    limit greatest(match_count * 4, 180)
  ),
  scored as materialized (
    select
      ph.researcher_id,
      ph.profile_rank,
      0::double precision as max_paper_rank,
      0::double precision as total_paper_rank,
      ph.profile_rank as combined_rank
    from profile_hits ph
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
    s.combined_rank as similarity,
    d.document_text,
    d.paper_count,
    coalesce(p.papers, '[]'::jsonb) as papers,
    s.profile_rank as keyword_profile_rank,
    s.max_paper_rank as keyword_paper_rank
  from scored s
  join public.researchers r on r.id = s.researcher_id
  left join public.researcher_documents d on d.researcher_id = r.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'title', ranked_papers.title,
        'abstract', ranked_papers.abstract,
        'year', ranked_papers.publication_year,
        'citations', ranked_papers.cited_by_count,
        'journal', ranked_papers.source_display_name,
        'openalex_work_id', ranked_papers.openalex_work_id,
        'doi', ranked_papers.doi,
        'relevance_score', null
      )
      order by ranked_papers.cited_by_count desc nulls last, ranked_papers.publication_year desc nulls last
    ) as papers
    from (
      select *
      from public.researcher_papers rp
      where rp.researcher_id = r.id
      order by rp.cited_by_count desc nulls last, rp.publication_year desc nulls last
      limit 10
    ) ranked_papers
  ) p on true
  where s.combined_rank > 0
    and (faculty_filters is null or cardinality(faculty_filters) = 0 or r.faculty = any(faculty_filters))
    and (
      role_filters is null
      or cardinality(role_filters) = 0
      or r.position_name = any(role_filters)
      or r."position" = any(role_filters)
    )
  order by s.combined_rank desc
  limit match_count;
$$;
