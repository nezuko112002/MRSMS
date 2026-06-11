-- Track items deferred at warehouse (approved but not ready to release yet)
alter table material_request_items
  add column if not exists release_deferred boolean not null default false;
