create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  central_gmail text not null unique check (central_gmail = lower(trim(central_gmail))),
  access_code_hash text not null unique check (access_code_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform_id text not null references public.platforms(id),
  account_email text not null check (account_email = lower(trim(account_email))),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, platform_id, account_email)
);

alter table public.code_assignments
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index clients_access_lookup_idx on public.clients (access_code_hash, status);
create index client_accounts_lookup_idx on public.client_accounts (client_id, platform_id, account_email) where active;
create index code_assignments_client_lookup_idx on public.code_assignments (client_id, customer_email, platform_id, status, created_at desc);

alter table public.clients enable row level security;
alter table public.client_accounts enable row level security;

create policy "admins manage clients" on public.clients for all to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())))
with check (created_by=(select auth.uid()) and exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));

create policy "admins manage client accounts" on public.client_accounts for all to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.client_accounts to authenticated;
