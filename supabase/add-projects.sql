-- ============================================================
-- Projects feature — run in Supabase SQL Editor
-- ============================================================

-- Projects table (admin-managed)
create table if not exists projects (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  department   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table projects enable row level security;

drop policy if exists "Active projects visible to authenticated" on projects;
create policy "Active projects visible to authenticated" on projects
  for select using (is_active = true or public.is_admin());

drop policy if exists "Admins manage projects" on projects;
create policy "Admins manage projects" on projects
  for all using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row execute procedure update_updated_at();

-- Link requests to projects
alter table material_requests add column if not exists project_id uuid references projects(id);

-- Backfill projects from existing request project names
insert into projects (name)
select distinct project_name
from material_requests
where project_name is not null and trim(project_name) <> ''
on conflict (name) do nothing;

update material_requests mr
set project_id = p.id
from projects p
where mr.project_id is null
  and mr.project_name = p.name;

-- Optional header fields no longer required on new requests
alter table material_requests alter column department drop not null;
alter table material_requests alter column purpose drop not null;
alter table material_requests alter column required_date drop not null;

create index if not exists idx_projects_is_active on projects(is_active);
create index if not exists idx_requests_project_id on material_requests(project_id);
