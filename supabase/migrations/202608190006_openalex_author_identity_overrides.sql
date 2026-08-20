begin;

with overrides(researcher_id, primary_openalex_id) as (
  values
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5035580795'::text),
    ('71e26e1b-1553-4609-9842-e79e1d70f784'::uuid, 'A5025725014'::text),
    ('9317784d-4933-43e9-97ce-85c2dc751954'::uuid, 'A5066699579'::text),
    ('1705ab48-5326-4e8e-90c8-ac90e881bff4'::uuid, 'A5133942808'::text)
)
update public.researcher_openalex_aliases as alias
set is_primary = false,
    source = 'coauthor_name_match',
    updated_at = now()
from overrides
where alias.researcher_id = overrides.researcher_id
  and alias.openalex_id <> overrides.primary_openalex_id;

with overrides(researcher_id, full_name, primary_openalex_id, evidence_note) as (
  values
    (
      '386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid,
      'Nigel Brandon'::text,
      'A5035580795'::text,
      'Verified primary energy-research record; 529 OpenAlex works and long-running Imperial affiliation.'::text
    ),
    (
      '71e26e1b-1553-4609-9842-e79e1d70f784'::uuid,
      'Fangxin Fang'::text,
      'A5025725014'::text,
      'Verified larger record with matching Imperial affiliation and research topics.'::text
    ),
    (
      '9317784d-4933-43e9-97ce-85c2dc751954'::uuid,
      'Cesar Quilodran Casas'::text,
      'A5066699579'::text,
      'User-confirmed canonical OpenAlex record.'::text
    ),
    (
      '1705ab48-5326-4e8e-90c8-ac90e881bff4'::uuid,
      'Guo Li'::text,
      'A5133942808'::text,
      'Verified recent Imperial machine-learning record; broad same-name records are excluded.'::text
    )
)
update public.researchers as researcher
set openalex_id = overrides.primary_openalex_id,
    updated_at = now()
from overrides
where researcher.id = overrides.researcher_id
  and researcher.openalex_id is distinct from overrides.primary_openalex_id;

with aliases(researcher_id, openalex_id, display_name, is_primary, evidence_note) as (
  values
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5025813347'::text, 'N. P. Brandon'::text, false, 'Verified split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5028882819'::text, 'Nigel Brandon'::text, false, 'Previous small primary record'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5035580795'::text, 'Nigel P. Brandon'::text, true, 'Verified primary record'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5086617223'::text, 'N.P. Brandon'::text, false, 'Verified older split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5122548412'::text, 'Nigel Brandon'::text, false, 'Verified recent split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5128077186'::text, 'Nigel P. Brandon'::text, false, 'Verified recent split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5128170840'::text, 'Nigel P. Brandon'::text, false, 'Verified recent split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5129215871'::text, 'Nigel P. Brandon'::text, false, 'Verified split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5130227804'::text, 'Nigel Brandon'::text, false, 'Verified recent split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5133239809'::text, 'Nigel Brandon'::text, false, 'Verified split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5141340577'::text, 'Nigel P. Brandon'::text, false, 'Verified split identity'),
    ('386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid, 'A5143554212'::text, 'Nigel P. Brandon'::text, false, 'Verified recent split identity'),
    ('71e26e1b-1553-4609-9842-e79e1d70f784'::uuid, 'A5025725014'::text, 'F. Fang'::text, true, 'Verified larger primary record'),
    ('71e26e1b-1553-4609-9842-e79e1d70f784'::uuid, 'A5115743359'::text, 'Fangxin Fang'::text, false, 'Verified split identity'),
    ('9317784d-4933-43e9-97ce-85c2dc751954'::uuid, 'A5066699579'::text, 'Cesar Quilodran Casas'::text, true, 'User-confirmed primary record'),
    ('9317784d-4933-43e9-97ce-85c2dc751954'::uuid, 'A5075331632'::text, 'Cesar Quilodran Casas'::text, false, 'User-confirmed split identity'),
    ('9317784d-4933-43e9-97ce-85c2dc751954'::uuid, 'A5114729984'::text, 'Cesar Quilodran Casas'::text, false, 'User-confirmed split identity'),
    ('1705ab48-5326-4e8e-90c8-ac90e881bff4'::uuid, 'A5133942808'::text, 'Guo Li'::text, true, 'Verified Imperial machine-learning identity')
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
  jsonb_build_object('manual_override', true, 'note', alias.evidence_note),
  now()
from aliases as alias
on conflict (researcher_id, openalex_id) do update
set display_name = excluded.display_name,
    source = excluded.source,
    confidence = 1,
    is_primary = excluded.is_primary,
    evidence = excluded.evidence,
    updated_at = now();

with resolved_aliases as (
  select alias.researcher_id, alias.openalex_id
  from public.researcher_openalex_aliases as alias
  where alias.researcher_id in (
    '386fa8af-5b87-4641-b868-c5e6a6cfed27'::uuid,
    '71e26e1b-1553-4609-9842-e79e1d70f784'::uuid,
    '9317784d-4933-43e9-97ce-85c2dc751954'::uuid,
    '1705ab48-5326-4e8e-90c8-ac90e881bff4'::uuid
  )
)
update public.researcher_coauthors as coauthor
set imperial_researcher_id = resolved_aliases.researcher_id,
    updated_at = now()
from resolved_aliases
where public.openalex_author_key(coauthor.coauthor_openalex_id) = resolved_aliases.openalex_id
  and coauthor.researcher_id <> resolved_aliases.researcher_id
  and coauthor.imperial_researcher_id is distinct from resolved_aliases.researcher_id;

commit;
