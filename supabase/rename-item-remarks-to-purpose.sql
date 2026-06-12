-- Rename request item notes field to purpose
alter table material_request_items
  rename column remarks to purpose;
