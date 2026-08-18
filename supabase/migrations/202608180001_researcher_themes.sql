create table if not exists public.researcher_themes (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  theme_key text not null,
  source_type text not null default 'openalex_topic' check (source_type in ('openalex_topic', 'embedding_cluster')),
  openalex_topic_id text,
  label text not null,
  description text not null default '',
  keywords text[] not null default '{}',
  domain_name text,
  field_name text,
  subfield_name text,
  centroid vector(1536),
  topic_strength real not null default 0 check (topic_strength >= 0),
  paper_share real not null default 0 check (paper_share >= 0 and paper_share <= 1),
  paper_count int not null default 0 check (paper_count >= 0),
  first_year int,
  latest_year int,
  recent_paper_count int not null default 0 check (recent_paper_count >= 0),
  trend text not null default 'stable' check (trend in ('emerging', 'stable', 'declining', 'insufficient_data')),
  confidence real not null default 0 check (confidence >= 0 and confidence <= 1),
  representative_paper_ids uuid[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  source_hash text not null,
  clustering_version text not null,
  embedding_model text not null default 'text-embedding-3-small',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (researcher_id, theme_key)
);

create table if not exists public.researcher_paper_themes (
  paper_id uuid primary key references public.researcher_papers(id) on delete cascade,
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  theme_id uuid not null references public.researcher_themes(id) on delete cascade,
  similarity real not null check (similarity >= -1 and similarity <= 1),
  is_representative boolean not null default false,
  assigned_at timestamptz not null default now()
);

create index if not exists researcher_themes_researcher_id_idx
  on public.researcher_themes(researcher_id);

create index if not exists researcher_themes_openalex_topic_id_idx
  on public.researcher_themes(openalex_topic_id, topic_strength desc)
  where openalex_topic_id is not null;

create index if not exists researcher_themes_activity_idx
  on public.researcher_themes(researcher_id, latest_year desc nulls last, paper_count desc);

create index if not exists researcher_themes_centroid_hnsw_idx
  on public.researcher_themes
  using hnsw (centroid vector_cosine_ops)
  where centroid is not null;

create index if not exists researcher_paper_themes_researcher_id_idx
  on public.researcher_paper_themes(researcher_id);

create index if not exists researcher_paper_themes_theme_id_idx
  on public.researcher_paper_themes(theme_id);

create index if not exists researcher_paper_authors_researcher_coauthor_idx
  on public.researcher_paper_authors(researcher_id, upper(coauthor_openalex_id));

alter table public.researcher_themes enable row level security;
alter table public.researcher_paper_themes enable row level security;

comment on table public.researcher_themes is
  'Cached research themes derived from OpenAlex Topics or, where needed, embedded-paper clusters.';

comment on table public.researcher_paper_themes is
  'One cached theme assignment per researcher-specific paper row.';

drop function if exists public.find_collaboration_opportunities(uuid, int);

create function public.find_collaboration_opportunities(
  p_researcher_id uuid,
  p_match_count int default 24
)
returns table (
  researcher_id uuid,
  profile_url text,
  openalex_id text,
  full_name text,
  title text,
  department text,
  faculty text,
  shared_topic_count bigint,
  topical_score double precision,
  cross_department boolean,
  cross_faculty boolean,
  shared_topic_ids text[],
  shared_topics jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with source_profile as (
    select
      r.id,
      regexp_replace(upper(coalesce(r.openalex_id, '')), '^HTTPS://OPENALEX.ORG/', '') as openalex_id,
      coalesce(r.affiliation, '') as department,
      coalesce(r.faculty, '') as faculty
    from public.researchers r
    where r.id = p_researcher_id
  ),
  source_topics as (
    select
      rt.openalex_topic_id,
      rt.label,
      rt.topic_strength,
      rt.paper_count,
      rt.latest_year,
      rt.trend,
      rt.evidence
    from public.researcher_themes rt
    where rt.researcher_id = p_researcher_id
      and rt.source_type = 'openalex_topic'
      and rt.openalex_topic_id is not null
  ),
  candidate_matches as (
    select
      candidate.researcher_id,
      source.openalex_topic_id,
      source.label,
      source.topic_strength as source_strength,
      candidate.topic_strength as candidate_strength,
      sqrt(source.topic_strength * candidate.topic_strength) as contribution,
      source.paper_count as source_paper_count,
      candidate.paper_count as candidate_paper_count,
      source.latest_year as source_latest_year,
      candidate.latest_year as candidate_latest_year,
      source.trend as source_trend,
      candidate.trend as candidate_trend,
      source.evidence as source_evidence,
      candidate.evidence as candidate_evidence
    from source_topics source
    join public.researcher_themes candidate
      on candidate.openalex_topic_id = source.openalex_topic_id
      and candidate.source_type = 'openalex_topic'
      and candidate.researcher_id <> p_researcher_id
  ),
  ranked_candidate_matches as (
    select
      candidate_matches.*,
      row_number() over (
        partition by candidate_matches.researcher_id
        order by candidate_matches.contribution desc, candidate_matches.label
      ) as evidence_rank
    from candidate_matches
  ),
  candidate_rollup as (
    select
      matches.researcher_id,
      count(*) as shared_topic_count,
      least(1.0, sum(matches.contribution)) as topical_score,
      array_agg(
        matches.openalex_topic_id
        order by matches.contribution desc, matches.label
      ) as shared_topic_ids,
      jsonb_agg(
        jsonb_build_object(
          'openalex_topic_id', matches.openalex_topic_id,
          'label', matches.label,
          'source_strength', matches.source_strength,
          'candidate_strength', matches.candidate_strength,
          'source_paper_count', matches.source_paper_count,
          'candidate_paper_count', matches.candidate_paper_count,
          'source_latest_year', matches.source_latest_year,
          'candidate_latest_year', matches.candidate_latest_year,
          'source_trend', matches.source_trend,
          'candidate_trend', matches.candidate_trend,
          'source_evidence', matches.source_evidence,
          'candidate_evidence', matches.candidate_evidence
        )
        order by matches.contribution desc, matches.label
      ) filter (where matches.evidence_rank <= 4) as shared_topics
    from ranked_candidate_matches matches
    group by matches.researcher_id
  )
  select
    candidate.id as researcher_id,
    candidate.profile_url,
    candidate.openalex_id,
    candidate.full_name,
    coalesce(candidate.position_name, candidate."position", 'Imperial researcher') as title,
    coalesce(candidate.affiliation, '') as department,
    coalesce(candidate.faculty, '') as faculty,
    rollup.shared_topic_count,
    rollup.topical_score,
    coalesce(candidate.affiliation, '') <> source_profile.department as cross_department,
    coalesce(candidate.faculty, '') <> source_profile.faculty as cross_faculty,
    rollup.shared_topic_ids,
    rollup.shared_topics
  from candidate_rollup rollup
  join public.researchers candidate on candidate.id = rollup.researcher_id
  cross join source_profile
  where coalesce(candidate.position_name, candidate."position", '') not ilike '%visiting%'
    and regexp_replace(upper(coalesce(candidate.openalex_id, '')), '^HTTPS://OPENALEX.ORG/', '') <> source_profile.openalex_id
    and not exists (
      select 1
      from public.researcher_paper_authors authorship
      where authorship.researcher_id = p_researcher_id
        and upper(authorship.coauthor_openalex_id) = regexp_replace(upper(coalesce(candidate.openalex_id, '')), '^HTTPS://OPENALEX.ORG/', '')
    )
    and not exists (
      select 1
      from public.researcher_paper_authors authorship
      where authorship.researcher_id = candidate.id
        and upper(authorship.coauthor_openalex_id) = source_profile.openalex_id
    )
  order by
    rollup.topical_score desc,
    rollup.shared_topic_count desc,
    candidate.full_name
  limit greatest(1, least(coalesce(p_match_count, 24), 50));
$$;

revoke all on function public.find_collaboration_opportunities(uuid, int) from public;
grant execute on function public.find_collaboration_opportunities(uuid, int) to service_role;
