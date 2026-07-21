insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y)
values ('Hartmann', 2, 2.5, 0, 0, 0)
on conflict (name) do nothing;
