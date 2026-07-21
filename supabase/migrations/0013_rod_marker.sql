-- 0013_rod_marker.sql
-- (Numbered 0013, not the plan's 0012: 0012_mission_building_footprint.sql
-- was taken by the Bagua sub-project after the plan was written.)
create table rod_marker (
  marker_id integer primary key,
  network_name text not null,
  rod_number integer not null
);
create index rod_marker_network_name_idx on rod_marker(network_name);
