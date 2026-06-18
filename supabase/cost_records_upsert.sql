-- Run in Supabase SQL editor (one cost record per material line; upsert on re-print).
create unique index if not exists idx_cost_records_item_id_unique on public.cost_records(item_id);

drop policy if exists "Finance can update costs" on public.cost_records;
drop policy if exists "Finance can delete costs" on public.cost_records;

create policy "Finance can update costs" on public.cost_records
  for update using (
    public.has_role(array['finance', 'admin', 'manager']::user_role[])
  )
  with check (
    public.has_role(array['finance', 'admin', 'manager']::user_role[])
  );

create policy "Finance can delete costs" on public.cost_records
  for delete using (
    public.has_role(array['finance', 'admin', 'manager']::user_role[])
  );
