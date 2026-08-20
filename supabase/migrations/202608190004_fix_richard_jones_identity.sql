begin;

do $$
declare
  target_researcher_id constant uuid := '498139a4-c2a1-470e-98a0-87bae96e1e04';
begin
  if not exists (
    select 1
    from public.researchers
    where id = target_researcher_id
      and profile_url = 'https://profiles.imperial.ac.uk/r.l.jones'
  ) then
    raise exception 'Richard Jones Imperial profile was not found';
  end if;

  -- The previous exact-name match linked this profile to an unrelated climate
  -- researcher. Remove every derived record before restoring the official list.
  delete from public.researcher_paper_themes
  where researcher_id = target_researcher_id;

  delete from public.researcher_themes
  where researcher_id = target_researcher_id;

  delete from public.researcher_collaboration_years
  where researcher_id = target_researcher_id;

  delete from public.researcher_coauthors
  where researcher_id = target_researcher_id;

  delete from public.researcher_paper_authors
  where researcher_id = target_researcher_id;

  delete from public.researcher_paper_documents
  where researcher_id = target_researcher_id;

  delete from public.researcher_documents
  where researcher_id = target_researcher_id;

  delete from public.researcher_papers
  where researcher_id = target_researcher_id;

  update public.researcher_coauthors
  set imperial_researcher_id = null,
      updated_at = now()
  where imperial_researcher_id = target_researcher_id;

  delete from public.researcher_openalex_aliases
  where researcher_id = target_researcher_id;

  update public.researchers
  set openalex_id = null,
      fields_of_research = 'Micropalaeontology; Ostracoda; Marine palaeoecology; Quaternary palaeoclimatology',
      updated_at = now()
  where id = target_researcher_id;

  insert into public.researcher_papers (
    researcher_id,
    openalex_work_id,
    title,
    abstract,
    publication_year,
    cited_by_count,
    source_display_name,
    doi
  ) values
    (
      target_researcher_id,
      'W2158162495',
      'Multi-proxy evidence for Holocene lake-level and salinity changes at An Loch Mor, a coastal lake on the Aran Islands, Western Ireland',
      null,
      2007,
      34,
      'Quaternary Science Reviews',
      'https://doi.org/10.1016/j.quascirev.2007.06.020'
    ),
    (
      target_researcher_id,
      'W252689852',
      'The marine Ostracoda of Pitcairn, Oeno and Henderson islands, southern Pacific',
      null,
      2004,
      9,
      'Revista Espanola de Micropaleontologia',
      null
    ),
    (
      target_researcher_id,
      'W2524427339',
      'The marine Ostracoda of Easter Island',
      null,
      2000,
      16,
      'Revista Espanola de Micropaleontologia',
      null
    ),
    (
      target_researcher_id,
      null,
      'Human impact and climate change at the western fringe of Europe: multidisciplinary studies of calcareous studies from An Loch Mor, Aran Islands, W. Ireland',
      null,
      2000,
      0,
      'Terra Nostra',
      null
    ),
    (
      target_researcher_id,
      'W1983451059',
      'Reconstructing late Quaternary deep-water masses in the eastern Arctic Ocean using benthonic Ostracoda',
      null,
      1999,
      33,
      'Marine Micropaleontology',
      'https://doi.org/10.1016/S0377-8398(99)00022-5'
    ),
    (
      target_researcher_id,
      'W2005825320',
      'The marine podocopid Ostracoda of Easter Island: a paradox in zoogeography and evolution',
      null,
      1999,
      19,
      'Marine Micropaleontology',
      'https://doi.org/10.1016/S0377-8398(99)00021-3'
    ),
    (
      target_researcher_id,
      null,
      'The zoogeographical distribution of deep water Ostracoda in the Arctic Ocean',
      null,
      1998,
      0,
      'What About Ostracoda!',
      null
    ),
    (
      target_researcher_id,
      null,
      'On Cytheropteron Bronwynae Joy & Clark',
      null,
      1995,
      0,
      'Stereo-Atlas of Ostracod Shells',
      null
    ),
    (
      target_researcher_id,
      null,
      'On Polycope Moenia Joy & Clark',
      null,
      1995,
      0,
      'Stereo-Atlas of Ostracod Shells',
      null
    );

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
    paper_title
  )
  select
    paper.id,
    target_researcher_id,
    paper.openalex_work_id,
    author.coauthor_openalex_id,
    author.coauthor_name,
    author.institution_ids,
    author.institution_names,
    paper.publication_year,
    paper.cited_by_count,
    paper.title
  from (
    values
      ('W2158162495', 'A5022291556', 'Jonathan A. Holmes', array['I45129253']::text[], array['University College London']::text[]),
      ('W2158162495', 'A5048309079', 'Jean Nicolas Haas', array['I190249584']::text[], array['Universitat Innsbruck']::text[]),
      ('W2158162495', 'A5062339630', 'Frank McDermott', array['I100930933']::text[], array['University College Dublin']::text[]),
      ('W2158162495', 'A5075336484', 'Karen Molloy', array['I188760350']::text[], array['University of Galway']::text[]),
      ('W2158162495', 'A5045180238', 'Michael O''Connell', array['I188760350']::text[], array['University of Galway']::text[]),
      ('W1983451059', 'A5110209532', 'Robin Whatley', array['I16038530', 'I97429440']::text[], array['Aberystwyth University', 'University of Wales']::text[]),
      ('W1983451059', 'A5026251160', 'Thomas M. Cronin', array['I1286329397']::text[], array['United States Geological Survey']::text[]),
      ('W1983451059', 'A5025977215', 'Harry J. Dowsett', array['I1286329397']::text[], array['United States Geological Survey']::text[]),
      ('W2524427339', 'A5110447914', 'R. C. Whatley', '{}'::text[], '{}'::text[]),
      ('W2524427339', 'A5113785594', 'Karel Wouters', '{}'::text[], '{}'::text[]),
      ('W2005825320', 'A5110209532', 'Robin Whatley', array['I16038530']::text[], array['Aberystwyth University']::text[]),
      ('W252689852', 'A5110209532', 'Robin Whatley', '{}'::text[], '{}'::text[]),
      ('W252689852', 'A5037657557', 'Stephen Oliver Peter A. Roberts', '{}'::text[], '{}'::text[])
  ) as author(openalex_work_id, coauthor_openalex_id, coauthor_name, institution_ids, institution_names)
  join public.researcher_papers as paper
    on paper.researcher_id = target_researcher_id
   and paper.openalex_work_id = author.openalex_work_id;

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
    target_researcher_id,
    paper_author.coauthor_openalex_id,
    max(paper_author.coauthor_name),
    count(distinct paper_author.paper_id)::int,
    coalesce((
      select array_agg(distinct institution_name order by institution_name)
      from public.researcher_paper_authors as author_institutions
      cross join lateral unnest(author_institutions.institution_names) as institution_name
      where author_institutions.researcher_id = target_researcher_id
        and author_institutions.coauthor_openalex_id = paper_author.coauthor_openalex_id
    ), '{}'::text[]),
    max(paper_author.publication_year),
    sum(coalesce(paper_author.cited_by_count, 0))::int,
    jsonb_agg(
      jsonb_build_object(
        'title', paper_author.paper_title,
        'year', paper_author.publication_year,
        'citations', paper_author.cited_by_count
      )
      order by paper_author.publication_year desc, paper_author.cited_by_count desc
    ),
    now()
  from public.researcher_paper_authors as paper_author
  where paper_author.researcher_id = target_researcher_id
  group by paper_author.coauthor_openalex_id;

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
    source_hash,
    clustering_version,
    embedding_model
  ) values
    (
      target_researcher_id,
      'openalex:T10017',
      'openalex_topic',
      'T10017',
      'Geology and Paleoclimatology Research',
      'Quaternary environmental change, lake records, palaeoclimate and Arctic deep-water history.',
      array['palaeoclimatology', 'Quaternary', 'Holocene', 'Arctic Ocean'],
      'Physical Sciences',
      'Earth and Planetary Sciences',
      'Atmospheric Science',
      0.44444445,
      0.44444445,
      4,
      1998,
      2007,
      0,
      'insufficient_data',
      0.9,
      'official-imperial-profile:r.l.jones:2026-08-19',
      'official-profile-correction-v1',
      'openalex-topics-2026-03'
    ),
    (
      target_researcher_id,
      'openalex:T10765',
      'openalex_topic',
      'T10765',
      'Marine Biology and Ecology Research',
      'Marine Ostracoda taxonomy, zoogeography, ecology and evolution in the Pacific and Arctic oceans.',
      array['Ostracoda', 'micropalaeontology', 'marine ecology', 'zoogeography'],
      'Physical Sciences',
      'Earth and Planetary Sciences',
      'Oceanography',
      0.5555556,
      0.5555556,
      5,
      1995,
      2004,
      0,
      'insufficient_data',
      0.9,
      'official-imperial-profile:r.l.jones:2026-08-19',
      'official-profile-correction-v1',
      'openalex-topics-2026-03'
    );

  insert into public.researcher_paper_themes (
    paper_id,
    researcher_id,
    theme_id,
    similarity,
    is_representative
  )
  select
    paper.id,
    target_researcher_id,
    theme.id,
    1,
    paper.title in (
      'Multi-proxy evidence for Holocene lake-level and salinity changes at An Loch Mor, a coastal lake on the Aran Islands, Western Ireland',
      'The marine Ostracoda of Easter Island'
    )
  from public.researcher_papers as paper
  join public.researcher_themes as theme
    on theme.researcher_id = target_researcher_id
   and theme.theme_key = case
      when paper.title in (
        'Multi-proxy evidence for Holocene lake-level and salinity changes at An Loch Mor, a coastal lake on the Aran Islands, Western Ireland',
        'Reconstructing late Quaternary deep-water masses in the eastern Arctic Ocean using benthonic Ostracoda',
        'Human impact and climate change at the western fringe of Europe: multidisciplinary studies of calcareous studies from An Loch Mor, Aran Islands, W. Ireland',
        'The zoogeographical distribution of deep water Ostracoda in the Arctic Ocean'
      ) then 'openalex:T10017'
      else 'openalex:T10765'
    end
  where paper.researcher_id = target_researcher_id;

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
    target_researcher_id,
    concat_ws(
      ' ',
      'Researcher: Richard Jones',
      'Faculty: Natural Sciences',
      'Fields: Micropalaeontology; Ostracoda; Marine palaeoecology; Quaternary palaeoclimatology',
      'Paper title: ' || paper.title,
      case when paper.abstract is not null then 'Abstract: ' || paper.abstract end,
      case when paper.source_display_name is not null then 'Source: ' || paper.source_display_name end
    ),
    'text-embedding-3-small',
    null,
    jsonb_build_object(
      'openalex_id', null,
      'full_name', 'Richard Jones',
      'openalex_work_id', paper.openalex_work_id
    ),
    now()
  from public.researcher_papers as paper
  where paper.researcher_id = target_researcher_id;

  insert into public.researcher_documents (
    researcher_id,
    document_text,
    paper_count,
    embedding_model,
    embedding,
    metadata,
    updated_at
  )
  select
    researcher.id,
    concat_ws(
      ' ',
      'Name: ' || researcher.full_name,
      'Position: ' || coalesce(researcher.position_name, researcher.position, ''),
      'Affiliation: ' || coalesce(researcher.affiliation, ''),
      'Faculty: ' || coalesce(researcher.faculty, ''),
      'Fields of research: ' || coalesce(researcher.fields_of_research, ''),
      'Profile: ' || coalesce(researcher.bio_about, ''),
      'Research: ' || coalesce(researcher.research, ''),
      'Official Imperial publications: ' || coalesce((
        select string_agg(paper.title, '; ' order by paper.publication_year desc, paper.title)
        from public.researcher_papers as paper
        where paper.researcher_id = researcher.id
      ), '')
    ),
    9,
    'text-embedding-3-small',
    null,
    jsonb_build_object(
      'openalex_id', null,
      'full_name', researcher.full_name,
      'faculty', researcher.faculty,
      'identity_source', 'official_imperial_profile'
    ),
    now()
  from public.researchers as researcher
  where researcher.id = target_researcher_id;
end
$$;

commit;
