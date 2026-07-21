-- supabase/migrations/0004_polarity_and_color.sql
alter table grid_template add column color text not null default '#888888';
-- NOTE: default '+' means any pre-existing grid_line rows (e.g. dev/test data
-- created before this migration ran) will silently end up with uniform '+'
-- polarity rather than real alternation. That's a side effect of adding a
-- NOT NULL column with a default, not a bug in the line generator — see
-- generateTheoreticalLines in src/geometry/gridGeneration.ts, which does
-- alternate polarity correctly for lines generated after this migration.
alter table grid_line add column polarity text not null default '+' check (polarity in ('+', '-'));
