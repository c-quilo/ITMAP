update public.researchers
set
  position_name = nullif(
    btrim(
      regexp_replace(
        position_name,
        E'\\s*MEDIA\\s+GUIDE\\s+Members of the media are welcome to contact me about my research and areas of expertise\\.?',
        ' ',
        'gi'
      )
    ),
    ''
  ),
  updated_at = now()
where position_name ~* E'MEDIA\\s+GUIDE\\s+Members of the media are welcome to contact me about my research and areas of expertise';

update public.researcher_documents
set
  document_text = btrim(
    regexp_replace(
      document_text,
      E'\\s*MEDIA\\s+GUIDE\\s+Members of the media are welcome to contact me about my research and areas of expertise\\.?',
      ' ',
      'gi'
    )
  ),
  updated_at = now()
where document_text ~* E'MEDIA\\s+GUIDE\\s+Members of the media are welcome to contact me about my research and areas of expertise';
