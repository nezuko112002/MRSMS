-- Allow deleting draft, pending, or rejected requests (run in Supabase SQL Editor)

drop policy if exists "Requestors can delete own cancellable requests" on material_requests;
create policy "Requestors can delete own cancellable requests" on material_requests
  for delete using (
    requested_by = auth.uid()
    and status in ('draft', 'pending', 'rejected')
  );

drop policy if exists "Admins can delete cancellable requests" on material_requests;
create policy "Admins can delete cancellable requests" on material_requests
  for delete using (
    public.is_admin()
    and status in ('draft', 'pending', 'rejected')
  );
