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
--    spacing_y_m is itself unverified (see GridTemplate.spacingXM/spacingYM
--    doc comment in src/domain/types.ts for how these feed the line
--    generator). Migration 0003 (already applied to remote) and this
--    migration order Hartmann's two spacing figures onto X/Y differently
--    (0003: X=2, Y=2.5; here: X=2.5, Y=1.8), which suggests a possible axis
--    swap that has not been confirmed against the manual or the field.
--    Laurent's decision (2026-07-18): apply this migration as written —
--    don't guess which axis is correct without field verification, since
--    spacing values are per-mission-adjustable anyway. If this assignment
--    turns out to be backwards for Hartmann, Palm, or Peyré (Curry and
--    Wissmann are square, so unaffected either way), those three networks
--    will render rotated 90 degrees from intent until corrected.
insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y, color)
values
  ('Hartmann', 2.5, 1.8, 0, 0, 0, '#d32f2f'),
  ('Curry', 4, 4, 45, 0, 0, '#f2c230'),
  ('Palm', 6.5, 4.5, 0, 0, 0, '#4a90c4'),
  ('Peyré', 7.25, 6.5, 0, 0, 0, '#8e5fb3'),
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
