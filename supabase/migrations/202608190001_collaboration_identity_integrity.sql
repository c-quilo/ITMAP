begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.openalex_author_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(substring(upper(coalesce(value, '')) from 'A[0-9]+'), '');
$$;

create or replace function public.researcher_name_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(unaccent(coalesce(value, ''))),
        '\m(prof|professor|dr|doctor|sir|dame)\M[.]?',
        '',
        'g'
      ),
      '\m[a-z]\M[.]?',
      '',
      'g'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create table if not exists public.researcher_openalex_aliases (
  researcher_id uuid not null references public.researchers(id) on delete cascade,
  openalex_id text not null,
  display_name text not null default '',
  source text not null check (source in ('primary', 'coauthor_name_match')),
  confidence real not null default 1 check (confidence >= 0 and confidence <= 1),
  is_primary boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (researcher_id, openalex_id)
);

create index if not exists researcher_openalex_aliases_openalex_id_idx
  on public.researcher_openalex_aliases(openalex_id, confidence desc);

create index if not exists researcher_openalex_aliases_researcher_id_idx
  on public.researcher_openalex_aliases(researcher_id, is_primary desc);

alter table public.researcher_openalex_aliases enable row level security;

comment on table public.researcher_openalex_aliases is
  'Canonical and alternate OpenAlex author IDs resolved to an Imperial researcher profile.';

insert into public.researcher_openalex_aliases (
  researcher_id,
  openalex_id,
  display_name,
  source,
  confidence,
  is_primary,
  evidence,
  updated_at
)
select
  researcher.id,
  public.openalex_author_key(researcher.openalex_id),
  researcher.full_name,
  'primary',
  1,
  true,
  jsonb_build_object('profile_openalex_id', researcher.openalex_id),
  now()
from public.researchers as researcher
where public.openalex_author_key(researcher.openalex_id) <> ''
on conflict (researcher_id, openalex_id) do update
set display_name = excluded.display_name,
    source = 'primary',
    confidence = 1,
    is_primary = true,
    evidence = excluded.evidence,
    updated_at = now();

with unique_profile_names as (
  select
    public.researcher_name_key(researcher.full_name) as name_key,
    (array_agg(researcher.id order by researcher.id::text))[1] as researcher_id
  from public.researchers as researcher
  where public.researcher_name_key(researcher.full_name) <> ''
  group by public.researcher_name_key(researcher.full_name)
  having count(*) = 1
),
raw_aliases as (
  select
    profile.researcher_id,
    public.openalex_author_key(coauthor.coauthor_openalex_id) as openalex_id,
    max(coauthor.coauthor_name) as display_name,
    count(*)::int as evidence_rows,
    sum(greatest(coauthor.shared_papers, 0))::int as evidence_papers
  from public.researcher_coauthors as coauthor
  join unique_profile_names as profile
    on profile.name_key = public.researcher_name_key(coauthor.coauthor_name)
  where public.openalex_author_key(coauthor.coauthor_openalex_id) <> ''
  group by profile.researcher_id, public.openalex_author_key(coauthor.coauthor_openalex_id)
),
unambiguous_aliases as (
  select raw.openalex_id
  from raw_aliases as raw
  group by raw.openalex_id
  having count(distinct raw.researcher_id) = 1
),
safe_aliases as (
  select raw.*
  from raw_aliases as raw
  join unambiguous_aliases as unambiguous using (openalex_id)
  where not exists (
    select 1
    from public.researchers as other_profile
    where public.openalex_author_key(other_profile.openalex_id) = raw.openalex_id
      and other_profile.id <> raw.researcher_id
  )
)
insert into public.researcher_openalex_aliases (
  researcher_id,
  openalex_id,
  display_name,
  source,
  confidence,
  is_primary,
  evidence,
  updated_at
)
select
  alias.researcher_id,
  alias.openalex_id,
  alias.display_name,
  'coauthor_name_match',
  case when alias.evidence_rows >= 2 or alias.evidence_papers >= 2 then 0.98 else 0.9 end,
  false,
  jsonb_build_object(
    'matching_rows', alias.evidence_rows,
    'shared_papers', alias.evidence_papers
  ),
  now()
from safe_aliases as alias
on conflict (researcher_id, openalex_id) do nothing;

alter table public.researcher_coauthors
  add column if not exists imperial_researcher_id uuid references public.researchers(id) on delete set null;

create index if not exists researcher_coauthors_imperial_researcher_idx
  on public.researcher_coauthors(researcher_id, imperial_researcher_id)
  where imperial_researcher_id is not null;

with resolved_coauthors as (
  select
    coauthor.id,
    (array_agg(distinct alias.researcher_id))[1] as researcher_id
  from public.researcher_coauthors as coauthor
  join public.researcher_openalex_aliases as alias
    on alias.openalex_id = public.openalex_author_key(coauthor.coauthor_openalex_id)
  group by coauthor.id
  having count(distinct alias.researcher_id) = 1
)
update public.researcher_coauthors as coauthor
set imperial_researcher_id = resolved.researcher_id,
    updated_at = now()
from resolved_coauthors as resolved
where coauthor.id = resolved.id
  and coauthor.imperial_researcher_id is distinct from resolved.researcher_id;

create or replace function public.resolve_researcher_coauthor_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_ids uuid[];
begin
  select array_agg(distinct alias.researcher_id)
  into resolved_ids
  from public.researcher_openalex_aliases as alias
  where alias.openalex_id = public.openalex_author_key(new.coauthor_openalex_id);

  if coalesce(cardinality(resolved_ids), 0) = 1 then
    new.imperial_researcher_id := resolved_ids[1];
  else
    new.imperial_researcher_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists resolve_researcher_coauthor_profile_trigger
  on public.researcher_coauthors;

create trigger resolve_researcher_coauthor_profile_trigger
before insert or update of coauthor_openalex_id
on public.researcher_coauthors
for each row
execute function public.resolve_researcher_coauthor_profile();

create or replace function public.register_researcher_primary_openalex_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_key text;
begin
  author_key := public.openalex_author_key(new.openalex_id);
  if author_key = '' then
    return new;
  end if;

  insert into public.researcher_openalex_aliases (
    researcher_id,
    openalex_id,
    display_name,
    source,
    confidence,
    is_primary,
    evidence,
    updated_at
  ) values (
    new.id,
    author_key,
    new.full_name,
    'primary',
    1,
    true,
    jsonb_build_object('profile_openalex_id', new.openalex_id),
    now()
  )
  on conflict (researcher_id, openalex_id) do update
  set display_name = excluded.display_name,
      source = 'primary',
      confidence = 1,
      is_primary = true,
      evidence = excluded.evidence,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists register_researcher_primary_openalex_alias_trigger
  on public.researchers;

create trigger register_researcher_primary_openalex_alias_trigger
after insert or update of openalex_id, full_name
on public.researchers
for each row
execute function public.register_researcher_primary_openalex_alias();

create index if not exists researcher_papers_openalex_work_id_idx
  on public.researcher_papers(openalex_work_id)
  where openalex_work_id is not null;

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
      researcher.id,
      public.openalex_author_key(researcher.openalex_id) as openalex_id,
      coalesce(researcher.affiliation, '') as department,
      coalesce(researcher.faculty, '') as faculty
    from public.researchers as researcher
    where researcher.id = p_researcher_id
  ),
  source_topics as (
    select
      theme.openalex_topic_id,
      theme.label,
      theme.topic_strength,
      theme.paper_count,
      theme.latest_year,
      theme.trend,
      theme.evidence
    from public.researcher_themes as theme
    where theme.researcher_id = p_researcher_id
      and theme.source_type = 'openalex_topic'
      and theme.openalex_topic_id is not null
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
    from source_topics as source
    join public.researcher_themes as candidate
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
    from ranked_candidate_matches as matches
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
  from candidate_rollup as rollup
  join public.researchers as candidate on candidate.id = rollup.researcher_id
  cross join source_profile
  where coalesce(candidate.position_name, candidate."position", '') not ilike '%visiting%'
    and not exists (
      select 1
      from public.researcher_openalex_aliases as source_alias
      join public.researcher_openalex_aliases as candidate_alias
        on candidate_alias.openalex_id = source_alias.openalex_id
      where source_alias.researcher_id = p_researcher_id
        and candidate_alias.researcher_id = candidate.id
    )
    and not exists (
      select 1
      from public.researcher_coauthors as known_collaborator
      where known_collaborator.researcher_id = p_researcher_id
        and known_collaborator.imperial_researcher_id = candidate.id
    )
    and not exists (
      select 1
      from public.researcher_coauthors as known_collaborator
      where known_collaborator.researcher_id = candidate.id
        and known_collaborator.imperial_researcher_id = p_researcher_id
    )
    and not exists (
      select 1
      from public.researcher_paper_authors as authorship
      join public.researcher_openalex_aliases as candidate_alias
        on candidate_alias.openalex_id = public.openalex_author_key(authorship.coauthor_openalex_id)
      where authorship.researcher_id = p_researcher_id
        and candidate_alias.researcher_id = candidate.id
    )
    and not exists (
      select 1
      from public.researcher_paper_authors as authorship
      join public.researcher_openalex_aliases as source_alias
        on source_alias.openalex_id = public.openalex_author_key(authorship.coauthor_openalex_id)
      where authorship.researcher_id = candidate.id
        and source_alias.researcher_id = p_researcher_id
    )
    and not exists (
      select 1
      from public.researcher_papers as source_paper
      join public.researcher_papers as candidate_paper
        on candidate_paper.openalex_work_id = source_paper.openalex_work_id
      where source_paper.researcher_id = p_researcher_id
        and candidate_paper.researcher_id = candidate.id
        and source_paper.openalex_work_id is not null
        and source_paper.openalex_work_id <> ''
    )
  order by
    rollup.topical_score desc,
    rollup.shared_topic_count desc,
    candidate.full_name
  limit greatest(1, least(coalesce(p_match_count, 24), 50));
$$;

revoke all on function public.find_collaboration_opportunities(uuid, int) from public;
grant execute on function public.find_collaboration_opportunities(uuid, int) to service_role;

commit;
