-- supabase/migrations/0005_seed_confirmed_networks.sql
insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y, color)
values
  ('Hartmann', 2.5, 1.8, 0, 0, 0, '#d32f2f'),
  ('Curry', 4, 4, 45, 0, 0, '#f2c230'),
  ('Palm', 6.5, 4.5, 0, 0, 0, '#4a90c4'),
  ('Peyré', 7.25, 6.5, 0, 0, 0, '#8e5fb3'),
  ('Wissmann', 10, 10, 45, 0, 0, '#2d6a4f')
on conflict (name) do update set
  spacing_x_m = excluded.spacing_x_m,
  spacing_y_m = excluded.spacing_y_m,
  angle_true_north_deg = excluded.angle_true_north_deg,
  color = excluded.color;
