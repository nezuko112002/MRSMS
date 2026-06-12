-- ============================================================
-- MRSMS — Full schema reference (fresh Supabase project only)
-- Do NOT run on a live database that already has data.
-- For existing projects use repair.sql instead.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('requestor', 'manager', 'warehouse', 'finance', 'admin');
create type request_status as enum ('draft', 'pending', 'approved', 'partially_approved', 'rejected', 'released', 'partially_released', 'confirmed', 'completed');
create type item_status as enum ('pending', 'approved', 'rejected', 'released', 'received');
create type release_status as enum ('complete', 'partial');

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  email        text not null unique,
  role         user_role not null default 'requestor',
  department   text,
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

-- Role helpers bypass RLS to avoid infinite recursion in policies
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

create policy "Users can view all profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can insert profiles" on profiles for insert with check (public.is_admin());
create policy "Admins can update any profile" on profiles for update using (public.is_admin());
create policy "Admins can delete profiles" on profiles for delete using (public.is_admin());

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'requestor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- INVENTORY
-- ============================================================
create table inventory (
  id            uuid primary key default uuid_generate_v4(),
  item_code     text not null unique,
  description   text not null,
  unit          text not null,
  stock_qty     numeric(12,2) not null default 0,
  unit_cost     numeric(12,2) not null default 0,
  minimum_stock numeric(12,2) not null default 0,
  category      text,
  location      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table inventory enable row level security;
create policy "Authenticated users can view inventory" on inventory for select using (auth.role() = 'authenticated');
create policy "Warehouse and admin can manage inventory" on inventory for all using (
  public.has_role(array['warehouse', 'admin']::user_role[])
) with check (
  public.has_role(array['warehouse', 'admin']::user_role[])
);

-- ============================================================
-- PROJECTS (admin-managed)
-- ============================================================
create table projects (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  department   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table projects enable row level security;
create policy "Active projects visible to authenticated" on projects
  for select using (is_active = true or public.is_admin());
create policy "Admins manage projects" on projects
  for all using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- MATERIAL REQUESTS
-- ============================================================
create table material_requests (
  id            uuid primary key default uuid_generate_v4(),
  request_no    text not null unique,
  project_id    uuid references projects(id),
  project_name  text not null,
  department    text,
  requested_by  uuid not null references profiles(id),
  required_date date,
  purpose       text,
  status        request_status not null default 'draft',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table material_requests enable row level security;
create policy "Requestors see own requests" on material_requests for select using (
  requested_by = auth.uid()
  or public.has_role(array['manager', 'warehouse', 'finance', 'admin']::user_role[])
);
create policy "Requestors can insert" on material_requests
  for insert to authenticated with check (requested_by = auth.uid());
create policy "Requestors can update own draft" on material_requests
  for update
  using (
    (requested_by = auth.uid() and status = 'draft')
    or public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  )
  with check (
    (requested_by = auth.uid() and status in ('draft', 'pending'))
    or public.has_role(array['manager', 'warehouse', 'admin']::user_role[])
  );
create policy "Requestors can delete own cancellable requests" on material_requests for delete using (
  requested_by = auth.uid()
  and status in ('draft', 'pending', 'rejected')
);
create policy "Admins can delete cancellable requests" on material_requests for delete using (
  public.is_admin()
  and status in ('draft', 'pending', 'rejected')
);

-- Auto-generate request_no (atomic per-year counter)
create table if not exists request_no_counters (
  year       int primary key,
  last_value int not null default 0
);

alter table request_no_counters disable row level security;

create or replace function generate_request_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  year_part text := to_char(now(), 'YYYY');
  year_int  int := cast(year_part as integer);
  seq_no    int;
begin
  if new.request_no is not null and btrim(new.request_no) <> '' then
    return new;
  end if;

  insert into request_no_counters (year, last_value)
  values (year_int, 1)
  on conflict (year) do update
  set last_value = request_no_counters.last_value + 1
  returning last_value into seq_no;

  new.request_no := 'MR-' || year_part || '-' || lpad(seq_no::text, 4, '0');
  return new;
end;
$$;

create trigger set_request_no
  before insert on material_requests
  for each row execute procedure generate_request_no();

-- ============================================================
-- MATERIAL REQUEST ITEMS
-- ============================================================
create table material_request_items (
  id            uuid primary key default uuid_generate_v4(),
  request_id    uuid not null references material_requests(id) on delete cascade,
  item_code     text,
  description   text not null,
  unit          text not null,
  requested_qty numeric(12,2) not null,
  approved_qty  numeric(12,2),
  released_qty  numeric(12,2),
  received_qty  numeric(12,2),
  purpose       text,
  reject_reason text,
  release_deferred boolean not null default false,
  status        item_status not null default 'pending',
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table material_request_items enable row level security;
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

-- ============================================================
-- APPROVAL HISTORY (Audit trail)
-- ============================================================
create table approval_history (
  id           uuid primary key default uuid_generate_v4(),
  request_id   uuid not null references material_requests(id) on delete cascade,
  action_by    uuid not null references profiles(id),
  action       text not null,  -- submitted, approved, partially_approved, rejected, released, confirmed
  comments     text,
  from_status  request_status,
  to_status    request_status,
  created_at   timestamptz not null default now()
);

alter table approval_history enable row level security;
create policy "Approval history visible to authenticated" on approval_history for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert history" on approval_history for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- MATERIAL RELEASE SLIPS
-- ============================================================
create table material_release_slips (
  id            uuid primary key default uuid_generate_v4(),
  slip_no       text not null unique,
  request_id    uuid not null references material_requests(id),
  released_by   uuid not null references profiles(id),
  release_date  timestamptz not null default now(),
  status        release_status not null default 'complete',
  notes         text,
  created_at    timestamptz not null default now()
);

alter table material_release_slips enable row level security;
create policy "Release slips visible to authenticated" on material_release_slips for select using (auth.role() = 'authenticated');
create policy "Warehouse can manage release slips" on material_release_slips for all using (
  public.has_role(array['warehouse', 'admin']::user_role[])
) with check (
  public.has_role(array['warehouse', 'admin']::user_role[])
);

-- Auto-generate slip_no
create or replace function generate_slip_no()
returns trigger language plpgsql as $$
declare
  year_part text := to_char(now(), 'YYYY');
  seq_no    int;
begin
  select coalesce(max(
    cast(split_part(slip_no, '-', 3) as integer)
  ), 0) + 1
  into seq_no
  from material_release_slips
  where slip_no like 'MRS-' || year_part || '-%';

  new.slip_no := 'MRS-' || year_part || '-' || lpad(seq_no::text, 4, '0');
  return new;
end;
$$;

create trigger set_slip_no
  before insert on material_release_slips
  for each row execute procedure generate_slip_no();

-- ============================================================
-- COST RECORDS
-- ============================================================
create table cost_records (
  id            uuid primary key default uuid_generate_v4(),
  request_id    uuid not null references material_requests(id),
  item_id       uuid not null references material_request_items(id),
  project_name  text not null,
  description   text not null,
  qty           numeric(12,2) not null,
  unit_cost     numeric(12,2) not null,
  total_cost    numeric(12,2) generated always as (qty * unit_cost) stored,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid references profiles(id)
);

alter table cost_records enable row level security;
create policy "Finance and admin can view costs" on cost_records for select using (
  public.has_role(array['finance', 'admin', 'manager']::user_role[])
);
create policy "System can insert costs" on cost_records for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- SEED DATA — Sample inventory items
-- ============================================================
insert into inventory (item_code, description, unit, stock_qty, unit_cost, minimum_stock, category) values
('CEM001',  'Portland Cement (40kg bag)',     'Bag',    500,  280,  50,  'Concrete'),
('CEM002',  'White Cement (25kg bag)',        'Bag',    100,  420,  20,  'Concrete'),
('RB010',   'Deformed Bar 10mm x 6m',        'Length', 300,  320,  30,  'Steel'),
('RB012',   'Deformed Bar 12mm x 6m',        'Length', 250,  450,  30,  'Steel'),
('RB016',   'Deformed Bar 16mm x 6m',        'Length', 150,  780,  20,  'Steel'),
('WIRE01',  'Tie Wire (#16)',                 'Roll',   80,   180,  10,  'Steel'),
('GRV001',  'Crushed Gravel 3/4"',           'Cu.m',   120,  950,  10,  'Aggregate'),
('SND001',  'Washed Sand',                   'Cu.m',   100,  750,  10,  'Aggregate'),
('PLY001',  'Marine Plywood 1/2" 4x8',       'Sheet',  200,  980,  20,  'Wood'),
('PLY002',  'Marine Plywood 3/4" 4x8',       'Sheet',  150, 1250,  15,  'Wood'),
('LUM001',  'Coco Lumber 2x3x10',            'Piece',  400,  120,  40,  'Wood'),
('LUM002',  'Coco Lumber 2x4x10',            'Piece',  350,  160,  40,  'Wood'),
('PNT001',  'Flat Latex Paint (4L)',          'Can',    60,   620,  10,  'Paint'),
('PNT002',  'Gloss Enamel Paint (4L)',        'Can',    40,   680,  10,  'Paint'),
('PVC001',  'PVC Pipe 1/2" x 3m',            'Length', 200,  85,   20,  'Plumbing'),
('PVC002',  'PVC Pipe 3/4" x 3m',            'Length', 150,  120,  20,  'Plumbing'),
('NAIL001', 'Common Wire Nails 2"',           'Kilo',   100,  65,   10,  'Hardware'),
('NAIL002', 'Common Wire Nails 3"',           'Kilo',   100,  65,   10,  'Hardware'),
('BOLT001', 'Anchor Bolt 1/2" x 4"',         'Piece',  500,  18,   50,  'Hardware'),
('GI001',   'G.I. Corrugated Roof Sheet 8ft','Sheet',  120,  580,  15,  'Roofing');

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_projects_is_active      on projects(is_active);
create index idx_requests_status         on material_requests(status);
create index idx_requests_project_id     on material_requests(project_id);
create index idx_requests_requested_by   on material_requests(requested_by);
create index idx_requests_created_at     on material_requests(created_at desc);
create index idx_items_request_id        on material_request_items(request_id);
create index idx_history_request_id      on approval_history(request_id);
create index idx_costs_request_id        on cost_records(request_id);
create index idx_inventory_item_code     on inventory(item_code);

-- ============================================================
-- UPDATED_AT trigger function
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at    before update on profiles            for each row execute procedure update_updated_at();
create trigger trg_projects_updated_at    before update on projects            for each row execute procedure update_updated_at();
create trigger trg_inventory_updated_at   before update on inventory            for each row execute procedure update_updated_at();
create trigger trg_requests_updated_at    before update on material_requests    for each row execute procedure update_updated_at();
create trigger trg_items_updated_at       before update on material_request_items for each row execute procedure update_updated_at();

-- ============================================================
-- REALTIME (instant live updates in the app)
-- ============================================================
alter table material_requests replica identity full;
alter table material_request_items replica identity full;
alter table approval_history replica identity full;
alter table material_release_slips replica identity full;
alter table cost_records replica identity full;
alter table profiles replica identity full;
alter table projects replica identity full;
alter table inventory replica identity full;
alter publication supabase_realtime add table material_requests;
alter publication supabase_realtime add table material_request_items;
alter publication supabase_realtime add table approval_history;
alter publication supabase_realtime add table material_release_slips;
alter publication supabase_realtime add table cost_records;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table inventory;
