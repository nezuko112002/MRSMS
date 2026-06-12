-- ============================================================
-- MRSMS — Live database repair (idempotent)
-- Run in Supabase SQL Editor → Run (NOT "enable RLS")
-- Safe to re-run on an existing project with data.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Role helpers (required by RLS; security definer avoids recursion)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(allowed user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any(allowed)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(array['admin']::user_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Schema alignment (columns added across app versions)
-- ---------------------------------------------------------------------------
alter table public.material_requests
  add column if not exists project_id uuid references public.projects(id);

alter table public.material_request_items
  add column if not exists release_deferred boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_request_items'
      and column_name = 'remarks'
  ) then
    alter table public.material_request_items rename column remarks to purpose;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Request number counter + trigger
-- ---------------------------------------------------------------------------
create table if not exists public.request_no_counters (
  year       int primary key,
  last_value int not null default 0
);

alter table public.request_no_counters disable row level security;

insert into public.request_no_counters (year, last_value)
select
  cast(split_part(request_no, '-', 2) as int) as year,
  max(cast(split_part(request_no, '-', 3) as int)) as last_value
from public.material_requests
where request_no ~ '^MR-[0-9]{4}-[0-9]+$'
group by 1
on conflict (year) do update
set last_value = greatest(public.request_no_counters.last_value, excluded.last_value);

create or replace function public.generate_request_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  year_part text := to_char(now(), 'YYYY');
  year_int  int := cast(year_part as integer);
  seq_no    int;
begin
  if new.request_no is not null and btrim(new.request_no) <> '' then
    return new;
  end if;

  insert into public.request_no_counters (year, last_value)
  values (year_int, 1)
  on conflict (year) do update
  set last_value = public.request_no_counters.last_value + 1
  returning last_value into seq_no;

  new.request_no := 'MR-' || year_part || '-' || lpad(seq_no::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists set_request_no on public.material_requests;
create trigger set_request_no
  before insert on public.material_requests
  for each row execute function public.generate_request_no();

create or replace function public.generate_slip_no()
returns trigger
language plpgsql
as $$
declare
  year_part text := to_char(now(), 'YYYY');
  seq_no    int;
begin
  select coalesce(max(cast(split_part(slip_no, '-', 3) as integer)), 0) + 1
  into seq_no
  from public.material_release_slips
  where slip_no like 'MRS-' || year_part || '-%';

  new.slip_no := 'MRS-' || year_part || '-' || lpad(seq_no::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists set_slip_no on public.material_release_slips;
create trigger set_slip_no
  before insert on public.material_release_slips
  for each row execute function public.generate_slip_no();

-- ---------------------------------------------------------------------------
-- profiles RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Admins can manage profiles" on public.profiles;
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can insert profiles" on public.profiles;
drop policy if exists "Admins can update any profile" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;

create policy "Users can view all profiles" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Admins can insert profiles" on public.profiles
  for insert with check (public.is_admin());
create policy "Admins can update any profile" on public.profiles
  for update using (public.is_admin());
create policy "Admins can delete profiles" on public.profiles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- inventory RLS
-- ---------------------------------------------------------------------------
alter table public.inventory enable row level security;

drop policy if exists "Authenticated users can view inventory" on public.inventory;
drop policy if exists "Warehouse and admin can manage inventory" on public.inventory;

create policy "Authenticated users can view inventory" on public.inventory
  for select using (auth.role() = 'authenticated');
create policy "Warehouse and admin can manage inventory" on public.inventory
  for all using (
    public.has_role(array['warehouse', 'admin']::user_role[])
  )
  with check (
    public.has_role(array['warehouse', 'admin']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- projects RLS
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "Active projects visible to authenticated" on public.projects;
drop policy if exists "Admins manage projects" on public.projects;

create policy "Active projects visible to authenticated" on public.projects
  for select using (is_active = true or public.is_admin());
create policy "Admins manage projects" on public.projects
  for all using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- material_requests RLS
-- ---------------------------------------------------------------------------
alter table public.material_requests enable row level security;

drop policy if exists "Requestors see own requests" on public.material_requests;
create policy "Requestors see own requests" on public.material_requests
  for select using (
    requested_by = auth.uid()
    or public.has_role(array['manager', 'warehouse', 'finance', 'admin']::user_role[])
  );

drop policy if exists "Requestors can insert" on public.material_requests;
create policy "Requestors can insert" on public.material_requests
  for insert
  to authenticated
  with check (requested_by = auth.uid());

drop policy if exists "Requestors can update own draft" on public.material_requests;
create policy "Requestors can update own draft" on public.material_requests
  for update
  using (
    (requested_by = auth.uid() and status = 'draft')
    or public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  )
  with check (
    (requested_by = auth.uid() and status in ('draft', 'pending'))
    or public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  );

drop policy if exists "Requestors can delete own cancellable requests" on public.material_requests;
create policy "Requestors can delete own cancellable requests" on public.material_requests
  for delete using (
    requested_by = auth.uid()
    and status in ('draft', 'pending', 'rejected')
  );

drop policy if exists "Admins can delete cancellable requests" on public.material_requests;
create policy "Admins can delete cancellable requests" on public.material_requests
  for delete using (
    public.is_admin()
    and status in ('draft', 'pending', 'rejected')
  );

-- ---------------------------------------------------------------------------
-- material_request_items RLS
-- ---------------------------------------------------------------------------
alter table public.material_request_items enable row level security;

drop policy if exists "Items visible with request" on public.material_request_items;
create policy "Items visible with request" on public.material_request_items
  for select using (
    exists (
      select 1 from public.material_requests mr
      where mr.id = request_id
      and (
        mr.requested_by = auth.uid()
        or public.has_role(array['manager', 'warehouse', 'finance', 'admin']::user_role[])
      )
    )
  );

drop policy if exists "Requestors can manage items on own draft" on public.material_request_items;
drop policy if exists "Requestors can insert items on own request" on public.material_request_items;
create policy "Requestors can insert items on own request" on public.material_request_items
  for insert with check (
    exists (
      select 1 from public.material_requests mr
      where mr.id = request_id
      and mr.requested_by = auth.uid()
      and mr.status in ('draft', 'pending')
    )
  );

drop policy if exists "Requestors can update own draft items" on public.material_request_items;
create policy "Requestors can update own draft items" on public.material_request_items
  for update using (
    exists (
      select 1 from public.material_requests mr
      where mr.id = request_id and mr.requested_by = auth.uid() and mr.status = 'draft'
    )
  );

drop policy if exists "Requestors can delete own draft items" on public.material_request_items;
create policy "Requestors can delete own draft items" on public.material_request_items
  for delete using (
    exists (
      select 1 from public.material_requests mr
      where mr.id = request_id and mr.requested_by = auth.uid() and mr.status = 'draft'
    )
  );

drop policy if exists "Managers can manage items" on public.material_request_items;
create policy "Managers can manage items" on public.material_request_items
  for all using (
    public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  )
  with check (
    public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- approval_history RLS
-- ---------------------------------------------------------------------------
alter table public.approval_history enable row level security;

drop policy if exists "Approval history visible to authenticated" on public.approval_history;
create policy "Approval history visible to authenticated" on public.approval_history
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert history" on public.approval_history;
create policy "Authenticated can insert history" on public.approval_history
  for insert with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- material_release_slips RLS
-- ---------------------------------------------------------------------------
alter table public.material_release_slips enable row level security;

drop policy if exists "Release slips visible to authenticated" on public.material_release_slips;
drop policy if exists "Warehouse can manage release slips" on public.material_release_slips;

create policy "Release slips visible to authenticated" on public.material_release_slips
  for select using (auth.role() = 'authenticated');
create policy "Warehouse can manage release slips" on public.material_release_slips
  for all using (
    public.has_role(array['warehouse', 'admin']::user_role[])
  )
  with check (
    public.has_role(array['warehouse', 'admin']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- cost_records RLS
-- ---------------------------------------------------------------------------
alter table public.cost_records enable row level security;

drop policy if exists "Finance and admin can view costs" on public.cost_records;
drop policy if exists "System can insert costs" on public.cost_records;

create policy "Finance and admin can view costs" on public.cost_records
  for select using (
    public.has_role(array['finance', 'admin', 'manager']::user_role[])
  );
create policy "System can insert costs" on public.cost_records
  for insert with check (auth.role() = 'authenticated');
