create table if not exists public.openalex_work_topics (
  openalex_work_id text primary key,
  topics text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

alter table public.openalex_work_topics enable row level security;

create or replace function public.organization_unique_publication_rollup(
  p_researcher_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with raw_papers as (
    select
      paper.id,
      paper.openalex_work_id,
      paper.title,
      paper.publication_year,
      coalesce(paper.cited_by_count, 0) as cited_by_count,
      coalesce(paper.source_display_name, '') as source_display_name,
      coalesce(paper.doi, '') as doi,
      lower(trim(regexp_replace(paper.title, '[^[:alnum:]]+', ' ', 'g'))) as normalized_title,
      coalesce(
        nullif(array_to_string(work_topics.topics, '; '), ''),
        trim(substring(document.document_text from E'Topics: ([^\\n]*)'))
      ) as topics_text
    from public.researcher_papers as paper
    left join public.researcher_paper_documents as document
      on document.paper_id = paper.id
    left join public.openalex_work_topics as work_topics
      on work_topics.openalex_work_id = paper.openalex_work_id
    where paper.researcher_id = any(coalesce(p_researcher_ids, array[]::uuid[]))
      and coalesce(paper.publication_year, 0) >= 1970
  ),
  keyed_papers as (
    select
      raw_papers.*,
      case
        when char_length(normalized_title) >= 24
          and cardinality(regexp_split_to_array(normalized_title, E'\\s+')) >= 5
          and normalized_title !~ '^(issue information|contents?|contents list|table of contents|front matter|back matter|editorial board|information for authors|publication information|masthead|editors? choice|preface|foreword|introduction|index|abstracts?)$'
          and normalized_title !~ '(publication information|information for authors)$'
          then 'title:' || normalized_title
        when doi <> ''
          then 'doi:' || lower(regexp_replace(doi, E'^https?://(?:dx\\.)?doi\\.org/', ''))
        when coalesce(openalex_work_id, '') <> ''
          then 'work:' || lower(openalex_work_id)
        else 'row:' || id::text
      end as publication_key,
      case
        when source_display_name !~* E'(arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints\\.org|osf preprints|eartharxiv|engrxiv)'
          and doi <> '' then 0
        when source_display_name !~* E'(arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints\\.org|osf preprints|eartharxiv|engrxiv)' then 1
        when doi <> '' then 2
        else 3
      end as canonical_rank
    from raw_papers
  ),
  canonical_papers as (
    select
      publication_key,
      (array_agg(title order by canonical_rank, publication_year desc nulls last, cited_by_count desc))[1] as title,
      (array_agg(openalex_work_id order by canonical_rank, publication_year desc nulls last, cited_by_count desc))[1] as openalex_work_id,
      (array_agg(nullif(doi, '') order by canonical_rank, publication_year desc nulls last, cited_by_count desc)
        filter (where doi <> ''))[1] as doi,
      max(publication_year) filter (where publication_year >= 1970) as publication_year,
      max(cited_by_count) as cited_by_count,
      string_agg(distinct nullif(topics_text, ''), '; ' order by nullif(topics_text, '')) as topics_text
    from keyed_papers
    group by publication_key
  ),
  topic_papers as (
    select distinct
      canonical.publication_key,
      canonical.title,
      canonical.openalex_work_id,
      canonical.doi,
      canonical.publication_year,
      canonical.cited_by_count,
      trim(topic.topic_label) as topic_label
    from canonical_papers as canonical
    cross join lateral regexp_split_to_table(coalesce(canonical.topics_text, ''), E'\\s*;\\s*') as topic(topic_label)
    where trim(topic.topic_label) <> ''
  ),
  topic_years as (
    select
      topic_label,
      publication_year,
      count(*) as paper_count
    from topic_papers
    where publication_year >= 1970
    group by topic_label, publication_year
  ),
  topic_totals as (
    select
      topic_label,
      count(*) as paper_count,
      count(*) filter (where publication_year >= extract(year from current_date)::int - 5) as recent_paper_count,
      min(publication_year) filter (where publication_year >= 1970) as first_year,
      max(publication_year) filter (where publication_year >= 1970) as latest_year
    from topic_papers
    group by topic_label
  ),
  overall_years as (
    select publication_year, count(*) as paper_count
    from canonical_papers
    where publication_year >= 1970
    group by publication_year
  )
  select jsonb_build_object(
    'paper_count', (select count(*) from canonical_papers),
    'year_counts', coalesce((
      select jsonb_agg(
        jsonb_build_object('year', publication_year, 'count', paper_count)
        order by publication_year
      )
      from overall_years
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', total.topic_label,
          'paper_count', total.paper_count,
          'recent_paper_count', total.recent_paper_count,
          'first_year', total.first_year,
          'latest_year', total.latest_year,
          'year_counts', coalesce((
            select jsonb_agg(
              jsonb_build_object('year', yearly.publication_year, 'count', yearly.paper_count)
              order by yearly.publication_year
            )
            from topic_years as yearly
            where yearly.topic_label = total.topic_label
          ), '[]'::jsonb),
          'evidence_papers', coalesce((
            select jsonb_agg(to_jsonb(evidence) order by evidence.publication_year desc, evidence.cited_by_count desc)
            from (
              select
                paper.openalex_work_id,
                paper.title,
                paper.publication_year,
                paper.cited_by_count,
                paper.doi
              from topic_papers as paper
              where paper.topic_label = total.topic_label
              order by paper.publication_year desc nulls last, paper.cited_by_count desc
              limit 5
            ) as evidence
          ), '[]'::jsonb)
        )
        order by total.paper_count desc, total.topic_label
      )
      from topic_totals as total
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.organization_unique_publication_rollup(uuid[]) from public;
grant execute on function public.organization_unique_publication_rollup(uuid[]) to service_role;
