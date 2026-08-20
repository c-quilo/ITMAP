begin;

do $$
declare
  target_researcher_id constant uuid := 'd60df847-fd0c-4fe3-a775-4cb57d8dbaad';
  primary_openalex_id constant text := 'A5069519185';
begin
  if not exists (
    select 1
    from public.researchers
    where id = target_researcher_id
      and profile_url = 'https://profiles.imperial.ac.uk/o.street18'
  ) then
    raise exception 'Oliver Street Imperial profile was not found';
  end if;

  update public.researchers
  set openalex_id = primary_openalex_id,
      updated_at = now()
  where id = target_researcher_id;

  delete from public.researcher_openalex_aliases
  where researcher_id = target_researcher_id;

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
    target_researcher_id,
    primary_openalex_id,
    'Oliver D. Street',
    'primary',
    1,
    true,
    jsonb_build_object(
      'manual_override', true,
      'note', 'User-confirmed OpenAlex record with matching Imperial affiliation and ORCID 0000-0002-2330-0300.'
    ),
    now()
  )
  on conflict (researcher_id, openalex_id) do update
  set display_name = excluded.display_name,
      source = excluded.source,
      confidence = excluded.confidence,
      is_primary = excluded.is_primary,
      evidence = excluded.evidence,
      updated_at = now();

  update public.researcher_coauthors
  set imperial_researcher_id = null,
      updated_at = now()
  where imperial_researcher_id = target_researcher_id
    and public.openalex_author_key(coauthor_openalex_id) <> primary_openalex_id;

  update public.researcher_coauthors
  set imperial_researcher_id = target_researcher_id,
      updated_at = now()
  where public.openalex_author_key(coauthor_openalex_id) = primary_openalex_id
    and researcher_id <> target_researcher_id
    and imperial_researcher_id is distinct from target_researcher_id;
end
$$;

commit;
