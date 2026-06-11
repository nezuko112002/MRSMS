-- Fix 403 when submitting material requests (items insert blocked by RLS)
-- Run this in Supabase SQL Editor

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
