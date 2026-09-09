alter table public.code_assignments
  add column if not exists source_message_id text;

create unique index if not exists code_assignments_gmail_message_unique_idx
  on public.code_assignments (client_id, source_message_id)
  where source_message_id is not null;
