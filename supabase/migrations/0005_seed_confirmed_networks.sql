-- supabase/migrations/0005_seed_confirmed_networks.sql
--
-- Seeds the 5 confirmed geobiological grid networks (Hartmann, Curry, Palm,
-- Peyré, Wissmann) from Laurent's physical reference manual.
--
-- PROVENANCE / OPEN QUESTIONS (Task 21 code review, findings I1/I2):
--  - spacing_x_m / spacing_y_m are range-midpoints taken from the manual, not
--    fixed truths. Real networks vary within a range and these values are
--    expected to be adjusted per mission once field data is available.
--  - Palm, Peyré, and Wissmann colors are visual placeholders only (chosen to
--    be distinct from each other and from Hartmann/Curry) pending Laurent's
--    real confirmed values.
--  - Wissmann's 45 deg angle assumes it shares Curry's diagonal orientation —
--    this is unverified and needs confirmation with Laurent.
--  - The assignment of the manual's two spacing figures to spacing_x_m vs
--    spacing_y_m (see GridTemplate.spacingXM/spacingYM doc comment in
--    src/domain/types.ts for how these feed the line generator) was RESOLVED
--    on 2026-07-18: Laurent supplied a manual diagram showing an E-W-running
--    line grid at 2.00m N-S spacing and a N-S-running line grid at 2.50m
--    E-W spacing. Cross-referenced against gridGeneration.ts's actual axis
--    semantics (spacingXM = spacing between axis-b lines, measured along
--    the bearing/N-S direction; spacingYM = spacing between axis-a lines,
--    measured perpendicular to bearing/E-W direction), this confirms
--    migration 0003's ordering (X=2, Y=2.5) was correct and this migration's
--    original ordering (X=2.5, Y=1.8) had Hartmann's two figures swapped.
--    Values below are corrected: for Hartmann, Palm, and Peyré, spacing_x_m
--    is now the manual's N-S figure and spacing_y_m is the manual's E-W
--    figure. Curry and Wissmann are square (X=Y) and were never affected.
insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y, color)
values
  ('Hartmann', 1.8, 2.5, 0, 0, 0, '#d32f2f'),
  ('Curry', 4, 4, 45, 0, 0, '#f2c230'),
  ('Palm', 4.5, 6.5, 0, 0, 0, '#4a90c4'),
  ('Peyré', 6.5, 7.25, 0, 0, 0, '#8e5fb3'),
  ('Wissmann', 10, 10, 45, 0, 0, '#2d6a4f')
-- Deliberately does NOT update origin_offset_x/origin_offset_y on conflict:
-- these two columns aren't part of the manual's authoritative data, so a
-- re-run of this seed should not clobber any per-instance customization of
-- them that may exist by the time this migration is re-applied.
on conflict (name) do update set
  spacing_x_m = excluded.spacing_x_m,
  spacing_y_m = excluded.spacing_y_m,
  angle_true_north_deg = excluded.angle_true_north_deg,
  color = excluded.color;
