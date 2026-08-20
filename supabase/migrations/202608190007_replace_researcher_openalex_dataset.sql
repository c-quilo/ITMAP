create or replace function public.replace_researcher_openalex_dataset(
  p_researcher_id uuid,
  p_papers jsonb,
  p_themes jsonb,
  p_paper_authors jsonb,
  p_coauthors jsonb,
  p_collaboration_years jsonb,
  p_profile_document jsonb,
  p_work_topics jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  replaced_papers int;
  replaced_themes int;
  replaced_coauthors int;
begin
  if not exists (select 1 from public.researchers where id = p_researcher_id) then
    raise exception 'Researcher % was not found', p_researcher_id;
  end if;

  if jsonb_typeof(coalesce(p_papers, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_papers) = 0 then
    raise exception 'Replacement paper payload must contain at least one paper';
  end if;

  -- All derived records are replaced in this transaction. If any insert fails,
  -- PostgreSQL restores the previous researcher dataset automatically.
  delete from public.researcher_paper_themes
  where researcher_id = p_researcher_id;

  delete from public.researcher_themes
  where researcher_id = p_researcher_id;

  delete from public.researcher_collaboration_years
  where researcher_id = p_researcher_id;

  delete from public.researcher_coauthors
  where researcher_id = p_researcher_id;

  update public.researcher_coauthors
  set imperial_researcher_id = null,
      updated_at = now()
  where imperial_researcher_id = p_researcher_id;

  delete from public.researcher_documents
  where researcher_id = p_researcher_id;

  delete from public.researcher_papers
  where researcher_id = p_researcher_id;

  insert into public.openalex_work_topics (openalex_work_id, topics, updated_at)
  select
    item->>'openalex_work_id',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'topics', '[]'::jsonb))),
      '{}'::text[]
    ),
    now()
  from jsonb_array_elements(coalesce(p_work_topics, '[]'::jsonb)) as item
  where coalesce(item->>'openalex_work_id', '') <> ''
  on conflict (openalex_work_id) do update
  set topics = excluded.topics,
      updated_at = now();

  insert into public.researcher_papers (
    researcher_id,
    openalex_work_id,
    title,
    abstract,
    publication_year,
    cited_by_count,
    source_display_name,
    doi
  )
  select
    p_researcher_id,
    item->>'openalex_work_id',
    item->>'title',
    nullif(item->>'abstract', ''),
    nullif(item->>'publication_year', '')::int,
    coalesce(nullif(item->>'cited_by_count', '')::int, 0),
    nullif(item->>'source_display_name', ''),
    nullif(item->>'doi', '')
  from jsonb_array_elements(p_papers) as item
  where coalesce(item->>'openalex_work_id', '') <> ''
    and coalesce(item->>'title', '') <> '';

  get diagnostics replaced_papers = row_count;
  if replaced_papers <> jsonb_array_length(p_papers) then
    raise exception 'Inserted % papers but payload contained %', replaced_papers, jsonb_array_length(p_papers);
  end if;

  insert into public.researcher_paper_documents (
    paper_id,
    researcher_id,
    document_text,
    embedding_model,
    embedding,
    metadata,
    updated_at
  )
  select
    paper.id,
    p_researcher_id,
    item->>'document_text',
    coalesce(nullif(item->>'embedding_model', ''), 'text-embedding-3-small'),
    case
      when jsonb_typeof(item->'embedding') = 'array' then (item->>'embedding')::vector
      else null
    end,
    coalesce(item->'metadata', '{}'::jsonb),
    now()
  from jsonb_array_elements(p_papers) as item
  join public.researcher_papers as paper
    on paper.researcher_id = p_researcher_id
   and paper.openalex_work_id = item->>'openalex_work_id';

  insert into public.researcher_themes (
    researcher_id,
    theme_key,
    source_type,
    openalex_topic_id,
    label,
    description,
    keywords,
    domain_name,
    field_name,
    subfield_name,
    topic_strength,
    paper_share,
    paper_count,
    first_year,
    latest_year,
    recent_paper_count,
    trend,
    confidence,
    evidence,
    source_hash,
    clustering_version,
    embedding_model,
    generated_at,
    updated_at
  )
  select
    p_researcher_id,
    item->>'theme_key',
    'openalex_topic',
    item->>'openalex_topic_id',
    item->>'label',
    coalesce(item->>'description', ''),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'keywords', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(item->>'domain_name', ''),
    nullif(item->>'field_name', ''),
    nullif(item->>'subfield_name', ''),
    coalesce(nullif(item->>'topic_strength', '')::real, 0),
    coalesce(nullif(item->>'paper_share', '')::real, 0),
    coalesce(nullif(item->>'paper_count', '')::int, 0),
    nullif(item->>'first_year', '')::int,
    nullif(item->>'latest_year', '')::int,
    coalesce(nullif(item->>'recent_paper_count', '')::int, 0),
    coalesce(nullif(item->>'trend', ''), 'insufficient_data'),
    coalesce(nullif(item->>'confidence', '')::real, 0),
    coalesce(item->'evidence', '{}'::jsonb),
    item->>'source_hash',
    coalesce(nullif(item->>'clustering_version', ''), 'openalex-live-rank-weight-v1'),
    coalesce(nullif(item->>'embedding_model', ''), 'openalex-live'),
    now(),
    now()
  from jsonb_array_elements(coalesce(p_themes, '[]'::jsonb)) as item;

  get diagnostics replaced_themes = row_count;

  insert into public.researcher_paper_themes (
    paper_id,
    researcher_id,
    theme_id,
    similarity,
    is_representative
  )
  select
    paper.id,
    p_researcher_id,
    theme.id,
    1,
    coalesce((item->>'is_representative')::boolean, false)
  from jsonb_array_elements(p_papers) as item
  join public.researcher_papers as paper
    on paper.researcher_id = p_researcher_id
   and paper.openalex_work_id = item->>'openalex_work_id'
  join public.researcher_themes as theme
    on theme.researcher_id = p_researcher_id
   and theme.openalex_topic_id = item->>'primary_topic_id'
  where coalesce(item->>'primary_topic_id', '') <> '';

  insert into public.researcher_paper_authors (
    paper_id,
    researcher_id,
    openalex_work_id,
    coauthor_openalex_id,
    coauthor_name,
    institution_ids,
    institution_names,
    publication_year,
    cited_by_count,
    paper_title,
    updated_at
  )
  select
    paper.id,
    p_researcher_id,
    item->>'openalex_work_id',
    item->>'coauthor_openalex_id',
    item->>'coauthor_name',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'institution_ids', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'institution_names', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(item->>'publication_year', '')::int,
    coalesce(nullif(item->>'cited_by_count', '')::int, 0),
    item->>'paper_title',
    now()
  from jsonb_array_elements(coalesce(p_paper_authors, '[]'::jsonb)) as item
  join public.researcher_papers as paper
    on paper.researcher_id = p_researcher_id
   and paper.openalex_work_id = item->>'openalex_work_id'
  where coalesce(item->>'coauthor_openalex_id', '') <> '';

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
    p_researcher_id,
    item->>'coauthor_openalex_id',
    item->>'coauthor_name',
    coalesce(nullif(item->>'shared_papers', '')::int, 0),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item->'institution_names', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(item->>'latest_year', '')::int,
    coalesce(nullif(item->>'total_citations', '')::int, 0),
    coalesce(item->'paper_titles', '[]'::jsonb),
    now()
  from jsonb_array_elements(coalesce(p_coauthors, '[]'::jsonb)) as item;

  get diagnostics replaced_coauthors = row_count;

  insert into public.researcher_collaboration_years (
    researcher_id,
    year,
    active_coauthors,
    new_coauthors,
    imperial_coauthors,
    cross_department,
    cross_faculty,
    other_institutions,
    shared_papers,
    total_coauthors,
    matched_imperial_coauthors,
    top_cross_department,
    updated_at
  )
  select
    p_researcher_id,
    (item->>'year')::int,
    coalesce(nullif(item->>'active_coauthors', '')::int, 0),
    coalesce(nullif(item->>'new_coauthors', '')::int, 0),
    coalesce(nullif(item->>'imperial_coauthors', '')::int, 0),
    coalesce(nullif(item->>'cross_department', '')::int, 0),
    coalesce(nullif(item->>'cross_faculty', '')::int, 0),
    coalesce(nullif(item->>'other_institutions', '')::int, 0),
    coalesce(nullif(item->>'shared_papers', '')::int, 0),
    coalesce(nullif(item->>'total_coauthors', '')::int, 0),
    coalesce(nullif(item->>'matched_imperial_coauthors', '')::int, 0),
    coalesce(item->'top_cross_department', '[]'::jsonb),
    now()
  from jsonb_array_elements(coalesce(p_collaboration_years, '[]'::jsonb)) as item;

  insert into public.researcher_documents (
    researcher_id,
    document_text,
    paper_count,
    embedding_model,
    embedding,
    metadata,
    updated_at
  ) values (
    p_researcher_id,
    p_profile_document->>'document_text',
    replaced_papers,
    coalesce(nullif(p_profile_document->>'embedding_model', ''), 'text-embedding-3-small'),
    case
      when jsonb_typeof(p_profile_document->'embedding') = 'array'
        then (p_profile_document->>'embedding')::vector
      else null
    end,
    coalesce(p_profile_document->'metadata', '{}'::jsonb),
    now()
  );

  return jsonb_build_object(
    'researcher_id', p_researcher_id,
    'papers', replaced_papers,
    'themes', replaced_themes,
    'coauthors', replaced_coauthors
  );
end;
$$;

revoke all on function public.replace_researcher_openalex_dataset(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public;

grant execute on function public.replace_researcher_openalex_dataset(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;
