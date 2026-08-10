-- supabase/migrations/0021_mission_selected_parcels_geometry.sql
alter table mission add column selected_parcels_geometry jsonb;
