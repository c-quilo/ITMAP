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
  first_identity text;
  second_identity text;
  first_display text;
  word_count int;
  marker_count int;
begin
  clean_value := regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g');
  if clean_value = '' then
    return '';
  end if;

  identity_key := lower(clean_value);
  identity_key := replace(identity_key, '&', ' and ');
  identity_key := replace(identity_key, 'center', 'centre');
  identity_key := regexp_replace(identity_key, '\mdept\M', 'department', 'g');
  identity_key := regexp_replace(identity_key, '[^a-z0-9]+', ' ', 'g');
  identity_key := regexp_replace(identity_key, '\s+', ' ', 'g');
  identity_key := trim(identity_key);

  if identity_key ~ '^.+ department of .+$' then
    first_identity := regexp_replace(identity_key, '^(.+) (department of .+)$', '\1');
    second_identity := regexp_replace(identity_key, '^(.+) (department of .+)$', '\2');
    if first_identity = second_identity then
      first_display := regexp_replace(clean_value, '^(.+) (Department of .+)$', '\1', 'i');
      identity_key := first_identity;
      clean_value := first_display;
    end if;
  end if;

  if identity_key like '%national heart and lung institute%' then
    return 'National Heart & Lung Institute';
  end if;
  if identity_key like '%grantham%' or identity_key like '%institute for climate change%' then
    return 'Grantham Institute for Climate Change';
  end if;

  case identity_key
    when 'business' then return 'Imperial College Business School';
    when 'business school' then return 'Imperial College Business School';
    when 'imperial business school' then return 'Imperial College Business School';
    when 'imperial college business school' then return 'Imperial College Business School';
    when 'department of analytics marketing and operations' then return 'Imperial College Business School';
    when 'department of economics and public policy' then return 'Imperial College Business School';
    when 'department of finance' then return 'Imperial College Business School';
    when 'department of management and entrepreneurship' then return 'Imperial College Business School';
    when 'of entrepreneurship business school' then return 'Imperial College Business School';
    when 'of practice business school' then return 'Imperial College Business School';
    when 'centre for en' then return 'Centre for Engagement and Simulation Science';
    when 'centre for hi' then return 'Centre for Higher Education Research and Scholarship';
    when 'centre for la' then return 'Centre for Languages, Culture and Communication';
    when 'centre for po' then return 'Centre for Population Biology';
    when 'department of earth science and engineering' then return 'Department of Earth Science & Engineering';
    when 'department of surgery and cancer' then return 'Department of Surgery & Cancer';
    when 'department of chemical engineering' then return 'Department of Chemical Engineering';
    when 'institute for security science and technology' then return 'Institute for Security Science & Technology';
    when 'data science institute' then return 'Data Science Institute';
    when 'uk bioengineering dyson school' then return 'School of Design Engineering';
    when 'hall shared the uk institute' then return 'Department of Physics';
    else null;
  end case;

  if identity_key ~ '\m(joined|worked|working|role|support|provides|commenced|tenure|professor|lecturer|researcher|administrator|admin|assistant|fellow|manager|director|lead|staff)\M' then
    return '';
  end if;

  select count(*)::int
  into marker_count
  from regexp_matches(
    identity_key,
    '\m(department|institute|school|faculty|centre|laboratory|lab|division)\M',
    'g'
  );

  word_count := coalesce(array_length(regexp_split_to_array(clean_value, '\s+'), 1), 0);
  if length(clean_value) > 110 or word_count > 15 or marker_count <> 1 then
    return '';
  end if;
  if clean_value ~* '\m(I|my|we|our|he|she|they|their)\M' then
    return '';
  end if;
  if clean_value !~* '^(Department of|Institute (of|for)|National .+ Institute|School of|Faculty of|Centre (for|of)|Center (for|of)|Division of|Laboratory (for|of)|Lab (for|of))' then
    return '';
  end if;

  return regexp_replace(clean_value, '^Center\y', 'Centre', 'i');
end;
$$;

comment on function public.itmap_canonical_organization_name(text) is
  'Normalises Imperial unit aliases, groups Business School sub-departments, and rejects malformed affiliation prose.';

commit;
