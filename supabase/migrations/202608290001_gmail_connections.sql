create table public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  google_email text not null check (google_email = lower(trim(google_email))),
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  granted_scope text not null,
  status text not null default 'active' check (status in ('active','error','revoked')),
  connected_by uuid not null references auth.users(id),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_history_id text,
  sync_error text,
  updated_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;

create policy "admins read gmail connection status"
on public.gmail_connections for select to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));

revoke all on public.gmail_connections from anon;
grant select on public.gmail_connections to authenticated;

create index gmail_connections_status_idx
on public.gmail_connections (status, last_sync_at);

