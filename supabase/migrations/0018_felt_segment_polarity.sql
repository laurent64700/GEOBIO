-- supabase/migrations/0018_felt_segment_polarity.sql
-- Nullable: manual placement (the network felt-point tool) always provides
-- both, but ArUco rod-marker detection (RodDetectionPanel) has no way to
-- sense polarity from marker position alone — leaving it null there is
-- honest ("not captured by this method"), not a fabricated default.
alter table felt_segment
  add column polarity_a text check (polarity_a in ('+', '-')),
  add column polarity_b text check (polarity_b in ('+', '-'));
