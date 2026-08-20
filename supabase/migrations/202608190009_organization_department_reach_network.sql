begin;

create or replace function public.itmap_canonical_organization_name(value text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  clean_value text;
  identity_key text;
begin
  clean_value := regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g');
  if clean_value = '' then
    return '';
  end if;

  identity_key := lower(clean_value);
  identity_key := replace(identity_key, '&', ' and ');
  identity_key := replace(identity_key, 'center', 'centre');
  identity_key := replace(identity_key, 'dept', 'department');
  identity_key := regexp_replace(identity_key, '[^a-z0-9]+', ' ', 'g');
  identity_key := regexp_replace(identity_key, '\s+', ' ', 'g');
  identity_key := trim(identity_key);

  if identity_key like '%national heart and lung institute%' then
    return 'National Heart & Lung Institute';
  end if;
  if identity_key like '%grantham%' or identity_key like '%institute for climate change%' then
    return 'Grantham Institute for Climate Change';
  end if;

  case identity_key
    when 'department of earth science and engineering' then return 'Department of Earth Science & Engineering';
    when 'department of surgery and cancer' then return 'Department of Surgery & Cancer';
    when 'department of analytics marketing and operations' then return 'Department of Analytics, Marketing and Operations';
    when 'institute for security science and technology' then return 'Institute for Security Science & Technology';
    else null;
  end case;

  return regexp_replace(clean_value, '^Center\y', 'Centre', 'i');
end;
$$;

create or replace function public.organization_department_reach_network(
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
  shared_profile_works as (
    select
      source_paper.researcher_id as source_researcher_id,
      target_paper.researcher_id as target_researcher_id,
      public.openalex_work_key(source_paper.openalex_work_id) as openalex_work_id,
      greatest(source_paper.publication_year, target_paper.publication_year) as publication_year,
      greatest(coalesce(source_paper.cited_by_count, 0), coalesce(target_paper.cited_by_count, 0)) as cited_by_count,
      source_paper.title as paper_title
    from public.researcher_papers as source_paper
    join requested_researchers as source_profile
      on source_profile.researcher_id = source_paper.researcher_id
    join public.researcher_papers as target_paper
      on target_paper.openalex_work_id = source_paper.openalex_work_id
      and target_paper.researcher_id <> source_paper.researcher_id
    where public.openalex_work_key(source_paper.openalex_work_id) <> ''
      and not exists (
        select 1
        from requested_researchers as requested_target
        where requested_target.researcher_id = target_paper.researcher_id
      )
  ),
  resolved_authorship_works as (
    select
      authorship.researcher_id as source_researcher_id,
      alias.researcher_id as target_researcher_id,
      public.openalex_work_key(authorship.openalex_work_id) as openalex_work_id,
      authorship.publication_year,
      greatest(coalesce(authorship.cited_by_count, 0), 0) as cited_by_count,
      authorship.paper_title
    from public.researcher_paper_authors as authorship
    join requested_researchers as source_profile
      on source_profile.researcher_id = authorship.researcher_id
    join public.researcher_openalex_aliases as alias
      on alias.openalex_id = public.openalex_author_key(authorship.coauthor_openalex_id)
    where authorship.researcher_id <> alias.researcher_id
      and public.openalex_work_key(authorship.openalex_work_id) <> ''
      and not exists (
        select 1
        from requested_researchers as requested_target
        where requested_target.researcher_id = alias.researcher_id
      )
  ),
  canonical_work_rows as (
    select
      source_researcher_id,
      target_researcher_id,
      openalex_work_id,
      max(publication_year)::int as publication_year,
      max(cited_by_count)::int as cited_by_count,
      max(paper_title) as paper_title
    from (
      select * from shared_profile_works
      union all
      select * from resolved_authorship_works
    ) as work_rows
    group by source_researcher_id, target_researcher_id, openalex_work_id
  ),
  enriched_work_rows as (
    select
      work.source_researcher_id,
      work.target_researcher_id,
      work.openalex_work_id,
      work.publication_year,
      work.cited_by_count,
      work.paper_title,
      public.itmap_canonical_organization_name(target.affiliation) as department,
      coalesce(target.faculty, '') as faculty
    from canonical_work_rows as work
    join public.researchers as target
      on target.id = work.target_researcher_id
  ),
  valid_work_rows as (
    select *
    from enriched_work_rows
    where department <> ''
      and lower(department) <> 'imperial college london'
  ),
  department_work_rows as (
    select
      department,
      openalex_work_id,
      max(faculty) as faculty,
      max(publication_year)::int as publication_year,
      max(cited_by_count)::int as cited_by_count,
      max(paper_title) as paper_title
    from valid_work_rows
    group by department, openalex_work_id
  ),
  department_participants as (
    select
      department,
      count(distinct source_researcher_id)::int as source_researcher_count,
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
      participants.source_researcher_count,
      participants.collaborator_count,
      coalesce(evidence.evidence_papers, '[]'::jsonb) as evidence_papers
    from department_work_rows as work
    join department_participants as participants using (department)
    left join evidence_by_department as evidence using (department)
    group by
      work.department,
      participants.source_researcher_count,
      participants.collaborator_count,
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

revoke all on function public.organization_department_reach_network(uuid[], int) from public;
grant execute on function public.organization_department_reach_network(uuid[], int) to service_role;

comment on function public.organization_department_reach_network(uuid[], int) is
  'Aggregates distinct co-authored OpenAlex works between one Imperial unit and other Imperial units.';

commit;
