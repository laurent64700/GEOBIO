-- 0014_mission_photo_calibration.sql
-- (Numbered 0014, not the plan's 0013 — see 0013_rod_marker.sql's note.)
alter table mission_photo add column calibration jsonb;
