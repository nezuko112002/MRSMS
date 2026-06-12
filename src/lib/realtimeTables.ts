/** Postgres tables published for Supabase Realtime (keep in sync with supabase/repair.sql). */
export const REALTIME_TABLES = [
  'material_requests',
  'material_request_items',
  'approval_history',
  'material_release_slips',
  'cost_records',
  'profiles',
  'projects',
  'inventory',
] as const;
