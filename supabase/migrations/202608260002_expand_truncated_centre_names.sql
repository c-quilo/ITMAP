begin;

update public.researchers
set
  affiliation = case affiliation
    when 'Centre for En' then 'Centre for Engagement and Simulation Science'
    when 'Centre for He' then 'Centre for Health Economics and Policy Innovation'
    when 'Centre for Hi' then 'Centre for Higher Education Research and Scholarship'
    when 'Centre for La' then 'Centre for Languages, Culture and Communication'
    when 'Centre for Po' then 'Centre for Population Biology'
    else affiliation
  end,
  updated_at = now()
where affiliation in (
  'Centre for En',
  'Centre for He',
  'Centre for Hi',
  'Centre for La',
  'Centre for Po'
);

update public.researcher_documents
set
  document_text = regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            document_text,
            E'Centre for En\\M',
            'Centre for Engagement and Simulation Science',
            'g'
          ),
          E'Centre for He\\M',
          'Centre for Health Economics and Policy Innovation',
          'g'
        ),
        E'Centre for Hi\\M',
        'Centre for Higher Education Research and Scholarship',
        'g'
      ),
      E'Centre for La\\M',
      'Centre for Languages, Culture and Communication',
      'g'
    ),
    E'Centre for Po\\M',
    'Centre for Population Biology',
    'g'
  ),
  updated_at = now()
where document_text ~ E'Centre for (En|He|Hi|La|Po)\\M';

commit;
