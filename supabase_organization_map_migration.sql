-- Spec-V 組織マップ本実装
-- 既存の診断・決済データは更新しない。受診完了時の集計専用スナップショットを追加する。

create table if not exists public.organization_assessments (
  id uuid primary key default gen_random_uuid(),
  token_id text not null unique references public.tokens(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  completed_at timestamptz not null default now(),
  type_name text not null,
  axis_suishinryoku numeric not null,
  axis_doku numeric not null,
  axis_kaihoudu numeric not null,
  axis_jikoniinti numeric not null,
  axis_tamashii numeric not null,
  axis_ai numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_assessments_org_id_idx
  on public.organization_assessments (org_id, completed_at desc);
create index if not exists organization_assessments_department_id_idx
  on public.organization_assessments (department_id, completed_at desc);

-- 組織向け画面の専用アクセスキー。平文では保存せず、SHA-256のみを保存する。
create table if not exists public.organization_map_access (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  access_key_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_assessments enable row level security;
alter table public.organization_map_access enable row level security;

drop policy if exists service_role_all on public.organization_assessments;
create policy service_role_all
  on public.organization_assessments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_all on public.organization_map_access;
create policy service_role_all
  on public.organization_map_access
  for all
  to service_role
  using (true)
  with check (true);
