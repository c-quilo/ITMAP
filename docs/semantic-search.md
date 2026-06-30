# ITMAP Semantic Search

This implementation uses Supabase Postgres with `pgvector` for semantic researcher retrieval.
Researcher-level semantic search is live. Paper metadata is shown as ranked evidence in
the UI. Paper embeddings are uploaded, but paper-vector matching should stay disabled
until the `researcher_paper_documents.embedding` index exists in Supabase.

## Runtime Flow

1. The user enters a mission in the Semantic search textarea.
2. The React app calls the Supabase Edge Function `search-researchers`.
3. The Edge Function embeds the mission with `text-embedding-3-small`.
4. Supabase runs `match_researcher_documents` against `researcher_documents.embedding`.
5. The app renders ranked researchers and ranked paper evidence.

Paper-vector matching can also use `match_researcher_paper_documents`, but that RPC is
too slow without a vector index over all paper embeddings. Keep it disabled in the Edge
Function until the paper index has been built.

The example mission in the textarea is only demo text. Stored researcher documents are mission-agnostic.

## Supabase Setup

1. Create a Supabase project.
2. Run the migration:

```bash
supabase db push
```

or paste `supabase/migrations/202606250001_semantic_search.sql` into the Supabase SQL editor.

3. Deploy the Edge Function:

```bash
supabase functions deploy search-researchers
```

4. Set Edge Function secrets:

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

5. Set app env vars:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## Data Pipeline

Generate researcher documents from the enriched Imperial profiles:

```bash
python3 scripts/build_researcher_documents.py
```

To include OpenAlex paper titles and abstracts, refresh AWS auth first:

```bash
aws login
```

Then run the Athena setup/export:

```bash
python3 scripts/prepare_athena_profile_input.py
python3 scripts/run_athena_query.py --sql-file scripts/athena_drop_profiles_input.sql
python3 scripts/run_athena_query.py --sql-file scripts/athena_create_profiles_input.sql
python3 scripts/run_athena_query.py --sql-file scripts/athena_create_works_json.sql
python3 scripts/run_athena_query.py --sql-file scripts/athena_export_researcher_papers.sql --csv-out /Users/caq13/Documents/ITMAP/researcher_papers.csv
python3 scripts/build_researcher_documents.py
```

Upload researcher-level documents and embeddings to Supabase first:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
export OPENAI_API_KEY=...
python3 scripts/upload_search_documents_to_supabase.py --scope researchers
```

After the app search works, upload paper metadata:

```bash
python3 scripts/upload_search_documents_to_supabase.py --scope paper-metadata
```

Then upload missing paper-level embeddings. This mode reuses existing paper metadata
and skips paper embeddings that are already present, so it can be resumed safely:

```bash
python3 scripts/upload_search_documents_to_supabase.py --scope paper-embeddings
```

To rebuild everything in one run, use:

```bash
python3 scripts/upload_search_documents_to_supabase.py --scope all
```

## Paper Vector Index

The paper embedding table is large enough that Supabase's dashboard/API route can time
out while building the index. Use a direct database connection when possible:

```sql
set statement_timeout = '0';

create index concurrently if not exists researcher_paper_documents_embedding_ivfflat_idx
  on public.researcher_paper_documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

analyze public.researcher_paper_documents;
```

After this index exists, re-enable the paper-vector RPC in
`supabase/functions/search-researchers/index.ts` and redeploy the function.

## Tables

- `researchers`: Imperial profile metadata.
- `researcher_papers`: OpenAlex paper evidence per researcher.
- `researcher_documents`: one combined semantic document and embedding per researcher.
- `researcher_paper_documents`: one semantic document and embedding per paper.
