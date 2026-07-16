create table if not exists public.search_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null default 'search',
  status text not null default 'success',
  query text,
  original_query text,
  expanded_query text,
  mode text,
  enable_rerank boolean,
  include_external_evidence boolean,
  rewrite_used boolean,
  duration_ms integer,
  result_count integer,
  candidate_count integer,
  llm_pool_size integer,
  models jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(12, 6),
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.search_audit_logs enable row level security;

create index if not exists search_audit_logs_created_at_idx
  on public.search_audit_logs (created_at desc);

create index if not exists search_audit_logs_mode_idx
  on public.search_audit_logs (mode);

create index if not exists search_audit_logs_status_idx
  on public.search_audit_logs (status);
