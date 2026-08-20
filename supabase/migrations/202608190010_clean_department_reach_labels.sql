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
  repeated_key text;
  word_count int;
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

  repeated_key := (regexp_match(identity_key, '^(.{4,}) \1$'))[1];
  if repeated_key is not null then
    identity_key := repeated_key;
  end if;

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
    when 'department of chemical engineering' then return 'Department of Chemical Engineering';
    when 'institute for security science and technology' then return 'Institute for Security Science & Technology';
    else null;
  end case;

  word_count := coalesce(array_length(regexp_split_to_array(clean_value, '\s+'), 1), 0);
  if length(clean_value) > 110 or word_count > 15 then
    return '';
  end if;
  if clean_value ~* '\m(I|my|we|our|he|she|they|their)\M' then
    return '';
  end if;
  if clean_value !~* '^(Department of|Institute (of|for)|National .+ Institute|School of|Faculty of|Centre (for|of)|Center (for|of)|Division of|Laboratory (for|of)|Lab (for|of))'
     and clean_value !~* '^[[:alnum:]&''() /-]+ (Institute|School|Laboratory|Lab)$' then
    return '';
  end if;

  return regexp_replace(clean_value, '^Center\y', 'Centre', 'i');
end;
$$;

comment on function public.itmap_canonical_organization_name(text) is
  'Normalises known Imperial unit aliases and rejects prose incorrectly stored as an affiliation.';

commit;
