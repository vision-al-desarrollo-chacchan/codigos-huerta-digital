alter table public.code_assignments
  add column if not exists access_code_hash text;

alter table public.code_assignments
  drop constraint if exists code_assignments_access_code_hash_check;

alter table public.code_assignments
  add constraint code_assignments_access_code_hash_check
  check (access_code_hash is null or access_code_hash ~ '^[a-f0-9]{64}$');

create index if not exists code_secure_lookup_idx
  on public.code_assignments (customer_email, platform_id, access_code_hash, status, created_at desc);
