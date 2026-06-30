do $$
begin
  perform set_config('maintenance_work_mem', '128MB', true);
  execute 'create index if not exists researcher_paper_documents_embedding_ivfflat_idx on public.researcher_paper_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
end $$;
