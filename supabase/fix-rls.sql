-- Fix 500 errors on profiles (RLS infinite recursion)
-- Run this in Supabase SQL Editor if you already applied schema.sql

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

-- profiles: "for all" admin policy caused recursion on every SELECT
drop policy if exists "Admins can manage profiles" on profiles;
drop policy if exists "Admins can insert profiles" on profiles;
drop policy if exists "Admins can update any profile" on profiles;
drop policy if exists "Admins can delete profiles" on profiles;
create policy "Admins can insert profiles" on profiles
  for insert with check (public.is_admin());
create policy "Admins can update any profile" on profiles
  for update using (public.is_admin());
create policy "Admins can delete profiles" on profiles
  for delete using (public.is_admin());

-- other tables: use helper to avoid querying profiles under RLS
drop policy if exists "Warehouse and admin can manage inventory" on inventory;
create policy "Warehouse and admin can manage inventory" on inventory for all using (
  public.has_role(array['warehouse', 'admin']::user_role[])
);

drop policy if exists "Requestors see own requests" on material_requests;
create policy "Requestors see own requests" on material_requests for select using (
  requested_by = auth.uid()
  or public.has_role(array['manager', 'warehouse', 'finance', 'admin']::user_role[])
);

drop policy if exists "Requestors can update own draft" on material_requests;
create policy "Requestors can update own draft" on material_requests for update using (
  (requested_by = auth.uid() and status = 'draft')
  or public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
);

drop policy if exists "Items visible with request" on material_request_items;
create policy "Items visible with request" on material_request_items for select using (
  exists (
    select 1 from material_requests mr
    where mr.id = request_id
    and (
      mr.requested_by = auth.uid()
      or public.has_role(array['manager', 'warehouse', 'finance', 'admin']::user_role[])
    )
  )
);

drop policy if exists "Requestors can manage items on own draft" on material_request_items;
drop policy if exists "Requestors can insert items on own request" on material_request_items;
drop policy if exists "Requestors can update own draft items" on material_request_items;
drop policy if exists "Requestors can delete own draft items" on material_request_items;
drop policy if exists "Managers can manage items" on material_request_items;

create policy "Requestors can insert items on own request" on material_request_items
  for insert with check (
    exists (
      select 1 from material_requests mr
      where mr.id = request_id
      and mr.requested_by = auth.uid()
      and mr.status in ('draft', 'pending')
    )
  );
create policy "Requestors can update own draft items" on material_request_items
  for update using (
    exists (
      select 1 from material_requests mr
      where mr.id = request_id and mr.requested_by = auth.uid() and mr.status = 'draft'
    )
  );
create policy "Requestors can delete own draft items" on material_request_items
  for delete using (
    exists (
      select 1 from material_requests mr
      where mr.id = request_id and mr.requested_by = auth.uid() and mr.status = 'draft'
    )
  );
create policy "Managers can manage items" on material_request_items
  for all using (
    public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  )
  with check (
    public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  );

drop policy if exists "Warehouse can manage release slips" on material_release_slips;
create policy "Warehouse can manage release slips" on material_release_slips for all using (
  public.has_role(array['warehouse', 'admin']::user_role[])
);

drop policy if exists "Finance and admin can view costs" on cost_records;
create policy "Finance and admin can view costs" on cost_records for select using (
  public.has_role(array['finance', 'admin', 'manager']::user_role[])
);
