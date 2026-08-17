begin;

create temporary table affected_pre_1970_researchers on commit drop as
select distinct researcher_id
from public.researcher_papers
where publication_year < 1970;

delete from public.researcher_papers
where publication_year < 1970;

update public.researcher_documents as document
set paper_count = (
      select count(*)::int
      from public.researcher_papers as paper
      where paper.researcher_id = document.researcher_id
    ),
    updated_at = now()
where document.researcher_id in (
  select researcher_id from affected_pre_1970_researchers
);

-- These summaries are derived from paper authorships. Clearing affected timeline
-- caches makes the edge function rebuild them from the post-1970 rows on demand.
delete from public.researcher_collaboration_years
where year < 1970
   or researcher_id in (
     select researcher_id from affected_pre_1970_researchers
   );

delete from public.researcher_coauthors
where researcher_id in (
  select researcher_id from affected_pre_1970_researchers
);

with coauthor_summary as (
  select
    authorship.researcher_id,
    authorship.coauthor_openalex_id,
    max(authorship.coauthor_name) as coauthor_name,
    count(distinct authorship.openalex_work_id)::int as shared_papers,
    max(authorship.publication_year) as latest_year,
    sum(coalesce(authorship.cited_by_count, 0))::int as total_citations
  from public.researcher_paper_authors as authorship
  where authorship.researcher_id in (
    select researcher_id from affected_pre_1970_researchers
  )
  group by authorship.researcher_id, authorship.coauthor_openalex_id
),
coauthor_institutions as (
  select
    authorship.researcher_id,
    authorship.coauthor_openalex_id,
    array_agg(distinct institution_name order by institution_name)
      filter (where institution_name <> '') as institution_names
  from public.researcher_paper_authors as authorship
  cross join lateral unnest(authorship.institution_names) as institution_name
  where authorship.researcher_id in (
    select researcher_id from affected_pre_1970_researchers
  )
  group by authorship.researcher_id, authorship.coauthor_openalex_id
),
ranked_papers as (
  select
    authorship.*,
    row_number() over (
      partition by authorship.researcher_id, authorship.coauthor_openalex_id
      order by coalesce(authorship.cited_by_count, 0) desc,
        coalesce(authorship.publication_year, 0) desc,
        authorship.paper_title
    ) as paper_rank
  from public.researcher_paper_authors as authorship
  where authorship.researcher_id in (
    select researcher_id from affected_pre_1970_researchers
  )
    and authorship.paper_title is not null
    and authorship.paper_title <> ''
),
coauthor_papers as (
  select
    researcher_id,
    coauthor_openalex_id,
    jsonb_agg(
      jsonb_build_object(
        'title', paper_title,
        'year', publication_year,
        'citations', cited_by_count,
        'openalex_work_id', openalex_work_id
      )
      order by paper_rank
    ) as paper_titles
  from ranked_papers
  where paper_rank <= 5
  group by researcher_id, coauthor_openalex_id
),
ranked_coauthors as (
  select
    summary.*,
    row_number() over (
      partition by summary.researcher_id
      order by summary.shared_papers desc,
        summary.total_citations desc,
        summary.latest_year desc nulls last,
        summary.coauthor_name
    ) as coauthor_rank
  from coauthor_summary as summary
)
insert into public.researcher_coauthors (
  researcher_id,
  coauthor_openalex_id,
  coauthor_name,
  shared_papers,
  institution_names,
  latest_year,
  total_citations,
  paper_titles,
  updated_at
)
select
  summary.researcher_id,
  summary.coauthor_openalex_id,
  summary.coauthor_name,
  summary.shared_papers,
  coalesce(institutions.institution_names, '{}'::text[]),
  summary.latest_year,
  summary.total_citations,
  coalesce(papers.paper_titles, '[]'::jsonb),
  now()
from ranked_coauthors as summary
left join coauthor_institutions as institutions
  using (researcher_id, coauthor_openalex_id)
left join coauthor_papers as papers
  using (researcher_id, coauthor_openalex_id)
where summary.coauthor_rank <= 100;

commit;
