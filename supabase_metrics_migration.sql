-- Spec-V 受診率メトリクス用の箱
-- 集計ロジックと個人別の表示は別フェーズで実装する。

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  target_count integer not null default 0 check (target_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists departments_org_id_idx
  on public.departments (org_id);

create table if not exists public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  token_id text not null references public.tokens(id) on delete cascade,
  sent_at timestamptz not null default now(),
  reminder_number integer not null check (reminder_number > 0)
);

create index if not exists reminder_logs_token_id_idx
  on public.reminder_logs (token_id);

alter table public.departments enable row level security;
alter table public.reminder_logs enable row level security;

drop policy if exists service_role_all on public.departments;
create policy service_role_all
  on public.departments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_all on public.reminder_logs;
create policy service_role_all
  on public.reminder_logs
  for all
  to service_role
  using (true)
  with check (true);

alter table public.tokens add column if not exists org_id text;
alter table public.tokens add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.tokens add column if not exists announced_at timestamptz;
alter table public.tokens add column if not exists deadline timestamptz;
alter table public.tokens add column if not exists announced_by text;

create index if not exists tokens_department_id_idx
  on public.tokens (department_id);
