-- supabase/migrations/0002_mission_origin.sql
alter table mission add column origin_lat double precision;
alter table mission add column origin_lng double precision;
