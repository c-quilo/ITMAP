create table if not exists public.researcher_collaboration_years (
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  year int not null check (year between 1900 and 2100),
  active_coauthors int not null default 0,
  new_coauthors int not null default 0,
  imperial_coauthors int not null default 0,
  cross_department int not null default 0,
  cross_faculty int not null default 0,
  other_institutions int not null default 0,
  shared_papers int not null default 0,
  total_coauthors int not null default 0,
  matched_imperial_coauthors int not null default 0,
  top_cross_department jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (researcher_id, year)
);

create index if not exists researcher_collaboration_years_researcher_idx
  on public.researcher_collaboration_years(researcher_id, year);

alter table public.researcher_collaboration_years enable row level security;
