create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.researchers (
  id uuid primary key default gen_random_uuid(),
  profile_url text,
  full_name text not null,
  openalex_id text,
  email text,
  bio_about text,
  research text,
  position_name text,
  "position" text,
  affiliation text,
  faculty text,
  fields_of_research text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists researchers_profile_url_key on public.researchers(profile_url);
create table if not exists public.researcher_papers (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  openalex_work_id text,
  title text not null,
  abstract text,
  publication_year int,
  cited_by_count int,
  source_display_name text,
  doi text,
  created_at timestamptz not null default now(),
  unique (researcher_id, openalex_work_id)
);

create table if not exists public.researcher_documents (
  researcher_id uuid primary key references public.researchers(id) on delete cascade,
  document_text text not null,
  paper_count int not null default 0,
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.researcher_paper_documents (
  paper_id uuid primary key references public.researcher_papers(id) on delete cascade,
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  document_text text not null,
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists researchers_openalex_id_idx on public.researchers(openalex_id);
create index if not exists researchers_faculty_idx on public.researchers(faculty);
create index if not exists researcher_papers_researcher_id_idx on public.researcher_papers(researcher_id);
create index if not exists researcher_documents_embedding_hnsw_idx
  on public.researcher_documents
  using hnsw (embedding vector_cosine_ops);
create index if not exists researcher_documents_text_trgm_idx
  on public.researcher_documents
  using gin (document_text gin_trgm_ops);
create index if not exists researcher_paper_documents_embedding_ivfflat_idx
  on public.researcher_paper_documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists researcher_paper_documents_researcher_id_idx
  on public.researcher_paper_documents(researcher_id);

create or replace function public.match_researcher_documents(
  query_embedding vector(1536),
  match_count int default 30,
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
as $$
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
    1 - (d.embedding <=> query_embedding) as similarity,
    d.document_text,
    d.paper_count,
    coalesce(p.papers, '[]'::jsonb) as papers
  from public.researcher_documents d
  join public.researchers r on r.id = d.researcher_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'title', title,
        'abstract', abstract,
        'year', publication_year,
        'citations', cited_by_count,
        'journal', source_display_name,
        'openalex_work_id', openalex_work_id
      )
      order by cited_by_count desc nulls last, publication_year desc nulls last
    ) as papers
    from (
      select *
      from public.researcher_papers rp
      where rp.researcher_id = r.id
      order by rp.cited_by_count desc nulls last, rp.publication_year desc nulls last
      limit 10
    ) ranked_papers
  ) p on true
  where d.embedding is not null
    and (faculty_filters is null or cardinality(faculty_filters) = 0 or r.faculty = any(faculty_filters))
    and (
      role_filters is null
      or cardinality(role_filters) = 0
      or r.position_name = any(role_filters)
      or r."position" = any(role_filters)
    )
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

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
