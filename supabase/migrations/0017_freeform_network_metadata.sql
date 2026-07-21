-- supabase/migrations/0017_freeform_network_metadata.sql
alter table freeform_network
  add column current_bearing_deg double precision,
  add column depth_m double precision,
  add column flow_rate text;
