begin;

create or replace function public.organization_department_reach_network_fast(
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
  source_work_rows as (
    select
      source_paper.openalex_work_id as stored_work_id,
      public.openalex_work_key(source_paper.openalex_work_id) as openalex_work_id,
      array_agg(distinct source_paper.researcher_id) as source_researcher_ids,
      max(source_paper.publication_year)::int as publication_year,
      max(coalesce(source_paper.cited_by_count, 0))::int as cited_by_count,
      max(source_paper.title) as paper_title
    from public.researcher_papers as source_paper
    join requested_researchers as source_profile
      on source_profile.researcher_id = source_paper.researcher_id
    where public.openalex_work_key(source_paper.openalex_work_id) <> ''
    group by source_paper.openalex_work_id, public.openalex_work_key(source_paper.openalex_work_id)
  ),
  external_work_rows as (
    select
      source.openalex_work_id,
      source.source_researcher_ids,
      target_paper.researcher_id as target_researcher_id,
      greatest(source.publication_year, target_paper.publication_year) as publication_year,
      greatest(source.cited_by_count, coalesce(target_paper.cited_by_count, 0)) as cited_by_count,
      source.paper_title,
      public.itmap_canonical_organization_name(target.affiliation) as department,
      coalesce(target.faculty, '') as faculty
    from source_work_rows as source
    join public.researcher_papers as target_paper
      on target_paper.openalex_work_id = source.stored_work_id
    join public.researchers as target
      on target.id = target_paper.researcher_id
    where not exists (
      select 1
      from requested_researchers as requested_target
      where requested_target.researcher_id = target_paper.researcher_id
    )
  ),
  valid_work_rows as (
    select *
    from external_work_rows
    where department <> ''
      and lower(department) <> 'imperial college london'
  ),
  department_work_rows as (
    select
      department,
      openalex_work_id,
      source_researcher_ids,
      max(faculty) as faculty,
      max(publication_year)::int as publication_year,
      max(cited_by_count)::int as cited_by_count,
      max(paper_title) as paper_title
    from valid_work_rows
    group by department, openalex_work_id, source_researcher_ids
  ),
  department_source_participants as (
    select
      work.department,
      count(distinct source_researcher_id)::int as source_researcher_count
    from department_work_rows as work
    cross join lateral unnest(work.source_researcher_ids) as source(source_researcher_id)
    group by work.department
  ),
  department_target_participants as (
    select
      department,
      count(distinct target_researcher_id)::int as collaborator_count
    from valid_work_rows
    group by department
  ),
  evidence_ranked as (
    select
      work.*,
      row_number() over (
        partition by work.department
        order by work.publication_year desc nulls last, work.cited_by_count desc, work.openalex_work_id
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
        order by publication_year desc nulls last, cited_by_count desc, openalex_work_id
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

revoke all on function public.organization_department_reach_network_fast(uuid[], int) from public;
grant execute on function public.organization_department_reach_network_fast(uuid[], int) to service_role;

comment on function public.organization_department_reach_network_fast(uuid[], int) is
  'Returns exact distinct-work department reach from shared stored paper sets, optimized for large Imperial units.';

commit;
