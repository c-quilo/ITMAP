begin;

with verified_aliases(researcher_id, openalex_id, display_name, is_primary, evidence) as (
  values
    (
      '74244ac1-cc20-45de-8c68-f17a3f5d9caa'::uuid,
      'A5053780405',
      'Emma Lawrance',
      true,
      '{"verification":"primary Imperial climate and mental-health record"}'::jsonb
    ),
    (
      '74244ac1-cc20-45de-8c68-f17a3f5d9caa'::uuid,
      'A5098226855',
      'Emma Lawrance',
      false,
      '{"verification":"split 2026 Imperial record","excluded_work_ids":["W2148920389"]}'::jsonb
    ),
    (
      '74244ac1-cc20-45de-8c68-f17a3f5d9caa'::uuid,
      'A5130325684',
      'Emma Lawrance',
      false,
      '{"verification":"retired OpenAlex split identity retained for historical authorships"}'::jsonb
    ),
    (
      '74244ac1-cc20-45de-8c68-f17a3f5d9caa'::uuid,
      'A5130572785',
      'Emma Lawrance',
      false,
      '{"verification":"retired OpenAlex split identity retained for historical authorships"}'::jsonb
    ),
    (
      'bb59314f-2636-44df-81a0-41cf1332aa5b'::uuid,
      'A5047290012',
      'Neil Jennings',
      true,
      '{"verification":"primary Imperial climate-policy record"}'::jsonb
    ),
    (
      'bb59314f-2636-44df-81a0-41cf1332aa5b'::uuid,
      'A5139444865',
      'Neil Jennings',
      false,
      '{"verification":"split 2026 Imperial record","excluded_work_ids":["W7172525571"]}'::jsonb
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
  case when alias.is_primary then 'primary' else 'coauthor_name_match' end,
  1,
  alias.is_primary,
  alias.evidence || jsonb_build_object('manual_override', true),
  now()
from verified_aliases as alias
on conflict (researcher_id, openalex_id) do update
set display_name = excluded.display_name,
    source = excluded.source,
    confidence = excluded.confidence,
    is_primary = excluded.is_primary,
    evidence = excluded.evidence,
    updated_at = now();

with resolved_aliases as (
  select alias.researcher_id, alias.openalex_id
  from public.researcher_openalex_aliases as alias
  where alias.researcher_id in (
    '74244ac1-cc20-45de-8c68-f17a3f5d9caa'::uuid,
    'bb59314f-2636-44df-81a0-41cf1332aa5b'::uuid
  )
)
update public.researcher_coauthors as coauthor
set imperial_researcher_id = resolved.researcher_id,
    updated_at = now()
from resolved_aliases as resolved
where public.openalex_author_key(coauthor.coauthor_openalex_id) = resolved.openalex_id
  and coauthor.imperial_researcher_id is distinct from resolved.researcher_id;

create or replace function public.openalex_work_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(substring(upper(coalesce(value, '')) from 'W[0-9]+'), '');
$$;

create or replace function public.organization_collaboration_network(
  p_researcher_ids uuid[],
  p_edge_limit int default 8000
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with requested_researchers as (
    select distinct researcher_id
    from unnest(coalesce(p_researcher_ids, array[]::uuid[])) as input(researcher_id)
    where researcher_id is not null
  ),
  shared_profile_works as (
    select
      least(first_paper.researcher_id::text, second_paper.researcher_id::text)::uuid as source_researcher_id,
      greatest(first_paper.researcher_id::text, second_paper.researcher_id::text)::uuid as target_researcher_id,
      public.openalex_work_key(first_paper.openalex_work_id) as openalex_work_id,
      greatest(first_paper.publication_year, second_paper.publication_year) as publication_year,
      greatest(coalesce(first_paper.cited_by_count, 0), coalesce(second_paper.cited_by_count, 0)) as cited_by_count
    from public.researcher_papers as first_paper
    join requested_researchers as first_profile
      on first_profile.researcher_id = first_paper.researcher_id
    join public.researcher_papers as second_paper
      on second_paper.openalex_work_id = first_paper.openalex_work_id
      and second_paper.researcher_id::text > first_paper.researcher_id::text
    join requested_researchers as second_profile
      on second_profile.researcher_id = second_paper.researcher_id
    where public.openalex_work_key(first_paper.openalex_work_id) <> ''
  ),
  resolved_authorship_works as (
    select
      least(authorship.researcher_id::text, alias.researcher_id::text)::uuid as source_researcher_id,
      greatest(authorship.researcher_id::text, alias.researcher_id::text)::uuid as target_researcher_id,
      public.openalex_work_key(authorship.openalex_work_id) as openalex_work_id,
      authorship.publication_year,
      greatest(coalesce(authorship.cited_by_count, 0), 0) as cited_by_count
    from public.researcher_paper_authors as authorship
    join requested_researchers as source_profile
      on source_profile.researcher_id = authorship.researcher_id
    join public.researcher_openalex_aliases as alias
      on alias.openalex_id = public.openalex_author_key(authorship.coauthor_openalex_id)
    join requested_researchers as target_profile
      on target_profile.researcher_id = alias.researcher_id
    where authorship.researcher_id <> alias.researcher_id
      and public.openalex_work_key(authorship.openalex_work_id) <> ''
  ),
  canonical_work_rows as (
    select
      source_researcher_id,
      target_researcher_id,
      openalex_work_id,
      max(publication_year)::int as publication_year,
      max(cited_by_count)::int as cited_by_count
    from (
      select * from shared_profile_works
      union all
      select * from resolved_authorship_works
    ) as work_rows
    group by source_researcher_id, target_researcher_id, openalex_work_id
  ),
  work_edges as (
    select
      source_researcher_id,
      target_researcher_id,
      count(*)::int as shared_papers,
      max(publication_year)::int as latest_year,
      sum(cited_by_count)::int as total_citations
    from canonical_work_rows
    group by source_researcher_id, target_researcher_id
  ),
  fallback_directed_edges as (
    select
      least(coauthor.researcher_id::text, coauthor.imperial_researcher_id::text)::uuid as source_researcher_id,
      greatest(coauthor.researcher_id::text, coauthor.imperial_researcher_id::text)::uuid as target_researcher_id,
      greatest(coauthor.shared_papers, 0) as shared_papers,
      coauthor.latest_year,
      greatest(coauthor.total_citations, 0) as total_citations
    from public.researcher_coauthors as coauthor
    join requested_researchers as source_profile
      on source_profile.researcher_id = coauthor.researcher_id
    join requested_researchers as target_profile
      on target_profile.researcher_id = coauthor.imperial_researcher_id
    where coauthor.imperial_researcher_id is not null
      and coauthor.researcher_id <> coauthor.imperial_researcher_id
      and coauthor.shared_papers > 0
  ),
  fallback_edges as (
    select
      source_researcher_id,
      target_researcher_id,
      max(shared_papers)::int as shared_papers,
      max(latest_year)::int as latest_year,
      max(total_citations)::int as total_citations
    from fallback_directed_edges
    group by source_researcher_id, target_researcher_id
  ),
  all_edge_pairs as (
    select source_researcher_id, target_researcher_id from work_edges
    union
    select source_researcher_id, target_researcher_id from fallback_edges
  ),
  canonical_edges as (
    select
      edge.source_researcher_id,
      edge.target_researcher_id,
      coalesce(work.shared_papers, fallback.shared_papers, 0)::int as shared_papers,
      coalesce(work.latest_year, fallback.latest_year)::int as latest_year,
      coalesce(work.total_citations, fallback.total_citations, 0)::int as total_citations
    from all_edge_pairs as edge
    left join work_edges as work using (source_researcher_id, target_researcher_id)
    left join fallback_edges as fallback using (source_researcher_id, target_researcher_id)
    where coalesce(work.shared_papers, fallback.shared_papers, 0) > 0
  ),
  ranked_edges as (
    select *
    from canonical_edges
    order by shared_papers desc, latest_year desc nulls last, source_researcher_id, target_researcher_id
    limit greatest(1, least(coalesce(p_edge_limit, 8000), 15000))
  ),
  connected_researchers as (
    select source_researcher_id as researcher_id from canonical_edges
    union
    select target_researcher_id as researcher_id from canonical_edges
  )
  select jsonb_build_object(
    'edge_count', (select count(*) from canonical_edges),
    'returned_edge_count', (select count(*) from ranked_edges),
    'connected_researcher_count', (select count(*) from connected_researchers),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source_researcher_id', edge.source_researcher_id,
          'target_researcher_id', edge.target_researcher_id,
          'shared_papers', edge.shared_papers,
          'latest_year', edge.latest_year,
          'total_citations', edge.total_citations
        )
        order by edge.shared_papers desc, edge.latest_year desc nulls last,
          edge.source_researcher_id, edge.target_researcher_id
      )
      from ranked_edges as edge
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.organization_collaboration_network(uuid[], int) from public;
grant execute on function public.organization_collaboration_network(uuid[], int) to service_role;

comment on function public.organization_collaboration_network(uuid[], int) is
  'Returns canonical undirected co-authorship links using distinct shared OpenAlex work IDs across split author identities.';

commit;
