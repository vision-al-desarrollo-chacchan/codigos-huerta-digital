create policy "admins read own profile" on public.admin_profiles for select to authenticated
using (user_id = (select auth.uid()));

create index if not exists clients_created_by_idx on public.clients (created_by);
create index if not exists client_accounts_platform_idx on public.client_accounts (platform_id);
create index if not exists code_assignments_created_by_idx on public.code_assignments (created_by);
create index if not exists code_assignments_platform_idx on public.code_assignments (platform_id);
