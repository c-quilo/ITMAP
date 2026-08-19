begin;

-- This work is incorrectly attributed to Neil Jennings in the imported dataset.
-- Deleting the paper also removes its paper-level embedding via the foreign key.
delete from public.researcher_papers
where researcher_id = 'bb59314f-2636-44df-81a0-41cf1332aa5b'::uuid
  and openalex_work_id = 'W1759887979'
  and publication_year = 1992;

update public.researcher_documents as document
set paper_count = (
      select count(*)::int
      from public.researcher_papers as paper
      where paper.researcher_id = document.researcher_id
    ),
    updated_at = now()
where document.researcher_id = 'bb59314f-2636-44df-81a0-41cf1332aa5b'::uuid;

commit;
