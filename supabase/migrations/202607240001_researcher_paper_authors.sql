create table if not exists public.researcher_paper_authors (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.researcher_papers(id) on delete cascade,
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  openalex_work_id text not null,
  coauthor_openalex_id text not null,
  coauthor_name text not null,
  institution_ids text[] not null default '{}'::text[],
  institution_names text[] not null default '{}'::text[],
  publication_year int,
  cited_by_count int,
  paper_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, coauthor_openalex_id)
);

create index if not exists researcher_paper_authors_researcher_id_idx
  on public.researcher_paper_authors(researcher_id);

create index if not exists researcher_paper_authors_coauthor_openalex_id_idx
  on public.researcher_paper_authors(coauthor_openalex_id);

create index if not exists researcher_paper_authors_work_id_idx
  on public.researcher_paper_authors(openalex_work_id);

create table if not exists public.researcher_coauthors (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  coauthor_openalex_id text not null,
  coauthor_name text not null,
  shared_papers int not null default 0,
  institution_names text[] not null default '{}'::text[],
  latest_year int,
  total_citations int not null default 0,
  paper_titles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (researcher_id, coauthor_openalex_id)
);

create index if not exists researcher_coauthors_researcher_id_idx
  on public.researcher_coauthors(researcher_id, shared_papers desc);

create index if not exists researcher_coauthors_coauthor_openalex_id_idx
  on public.researcher_coauthors(coauthor_openalex_id);
