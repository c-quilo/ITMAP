begin;

create or replace function public.organization_department_reach_network_rollup(
  p_researcher_ids uuid[],
  p_department_limit int default 80
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
  raw_connection_rows as (
    select
      coauthor.researcher_id as source_researcher_id,
      coauthor.imperial_researcher_id as target_researcher_id,
      public.itmap_canonical_organization_name(target.affiliation) as department,
      coalesce(target.faculty, '') as faculty,
      public.openalex_work_key(paper.value->>'openalex_work_id') as openalex_work_id,
      trim(coalesce(paper.value->>'title', '')) as paper_title,
      case
        when coalesce(paper.value->>'year', '') ~ '^[0-9]{4}$'
          then (paper.value->>'year')::int
        else null
      end as publication_year,
      case
        when coalesce(paper.value->>'citations', '') ~ '^[0-9]+$'
          then (paper.value->>'citations')::int
        else 0
      end as cited_by_count
    from public.researcher_coauthors as coauthor
    join requested_researchers as source
      on source.researcher_id = coauthor.researcher_id
    join public.researchers as target
      on target.id = coauthor.imperial_researcher_id
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coauthor.paper_titles) = 'array' then coauthor.paper_titles
        else '[]'::jsonb
      end
    ) as paper(value)
    where coauthor.imperial_researcher_id is not null
      and not exists (
        select 1
        from requested_researchers as internal_target
        where internal_target.researcher_id = coauthor.imperial_researcher_id
      )
  ),
  connection_rows as (
    select
      raw.*,
      case
        when raw.openalex_work_id <> '' then raw.openalex_work_id
        else 'TITLE:' || md5(lower(raw.paper_title))
      end as work_key
    from raw_connection_rows as raw
    where raw.department <> ''
      and lower(raw.department) <> 'imperial college london'
      and (raw.openalex_work_id <> '' or raw.paper_title <> '')
  ),
  department_work_rows as (
    select
      department,
      work_key,
      max(faculty) as faculty,
      max(openalex_work_id) as openalex_work_id,
      max(paper_title) as paper_title,
      max(publication_year)::int as publication_year,
      max(cited_by_count)::int as cited_by_count
    from connection_rows
    group by department, work_key
  ),
  department_source_participants as (
    select
      department,
      count(distinct source_researcher_id)::int as source_researcher_count
    from connection_rows
    group by department
  ),
  department_target_participants as (
    select
      department,
      count(distinct target_researcher_id)::int as collaborator_count
    from connection_rows
    group by department
  ),
  evidence_ranked as (
    select
      work.*,
      row_number() over (
        partition by work.department
        order by work.publication_year desc nulls last, work.cited_by_count desc, work.work_key
      ) as evidence_rank
    from department_work_rows as work
  ),
  evidence_by_department as (
    select
      department,
      jsonb_agg(
        jsonb_build_object(
          'openalex_work_id', openalex_work_id,
          'title', paper_title,
          'publication_year', publication_year,
          'cited_by_count', cited_by_count
        )
        order by publication_year desc nulls last, cited_by_count desc, work_key
      ) filter (where evidence_rank <= 6) as evidence_papers
    from evidence_ranked
    group by department
  ),
  department_edges as (
    select
      work.department,
      max(work.faculty) as faculty,
      count(*)::int as shared_papers,
      max(work.publication_year)::int as latest_year,
      sum(work.cited_by_count)::bigint as total_citations,
      source_participants.source_researcher_count,
      target_participants.collaborator_count,
      coalesce(evidence.evidence_papers, '[]'::jsonb) as evidence_papers
    from department_work_rows as work
    join department_source_participants as source_participants using (department)
    join department_target_participants as target_participants using (department)
    left join evidence_by_department as evidence using (department)
    group by
      work.department,
      source_participants.source_researcher_count,
      target_participants.collaborator_count,
      evidence.evidence_papers
  ),
  ranked_edges as (
    select *
    from department_edges
    order by shared_papers desc, source_researcher_count desc, latest_year desc nulls last, department
    limit greatest(1, least(coalesce(p_department_limit, 80), 200))
  )
  select jsonb_build_object(
    'department_count', (select count(*) from department_edges),
    'returned_department_count', (select count(*) from ranked_edges),
    'shared_papers', coalesce((select sum(shared_papers) from department_edges), 0),
    'departments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'department', edge.department,
          'faculty', edge.faculty,
          'shared_papers', edge.shared_papers,
          'latest_year', edge.latest_year,
          'total_citations', edge.total_citations,
          'source_researcher_count', edge.source_researcher_count,
          'collaborator_count', edge.collaborator_count,
          'evidence_papers', edge.evidence_papers
        )
        order by edge.shared_papers desc, edge.source_researcher_count desc,
          edge.latest_year desc nulls last, edge.department
      )
      from ranked_edges as edge
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.organization_department_reach_network_rollup(uuid[], int) from public;
grant execute on function public.organization_department_reach_network_rollup(uuid[], int) to service_role;

comment on function public.organization_department_reach_network_rollup(uuid[], int) is
  'Returns distinct-work department reach from indexed canonical co-author rollups for very large Imperial units.';

commit;
