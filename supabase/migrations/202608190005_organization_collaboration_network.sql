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
  directed_edges as (
    select
      case
        when coauthor.researcher_id::text < coauthor.imperial_researcher_id::text
          then coauthor.researcher_id
        else coauthor.imperial_researcher_id
      end as source_researcher_id,
      case
        when coauthor.researcher_id::text < coauthor.imperial_researcher_id::text
          then coauthor.imperial_researcher_id
        else coauthor.researcher_id
      end as target_researcher_id,
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
  canonical_edges as (
    select
      source_researcher_id,
      target_researcher_id,
      max(shared_papers)::int as shared_papers,
      max(latest_year)::int as latest_year,
      max(total_citations)::int as total_citations
    from directed_edges
    group by source_researcher_id, target_researcher_id
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
  'Returns canonical undirected co-authorship links among a selected set of Imperial researcher profiles.';
