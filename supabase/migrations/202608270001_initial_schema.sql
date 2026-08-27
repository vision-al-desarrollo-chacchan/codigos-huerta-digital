create table public.platforms (
  id text primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.code_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_email text not null check (customer_email = lower(trim(customer_email))),
  platform_id text not null references public.platforms(id),
  code text not null check (char_length(code) between 3 and 100),
  status text not null default 'available' check (status in ('available','viewed','expired','cancelled')),
  viewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index code_lookup_idx on public.code_assignments (customer_email, platform_id, status, created_at desc);
alter table public.platforms enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.code_assignments enable row level security;

create policy "admins read platforms" on public.platforms for select to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));
create policy "admins read assignments" on public.code_assignments for select to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));
create policy "admins insert assignments" on public.code_assignments for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));
create policy "admins update assignments" on public.code_assignments for update to authenticated
using (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid())));

grant select on public.platforms to authenticated;
grant select, insert, update on public.code_assignments to authenticated;
grant select on public.admin_profiles to authenticated;
insert into public.platforms(id,name) values ('netflix','Netflix'),('disney','Disney+'),('max','Max'),('prime','Prime Video'),('apple','Apple TV+');
