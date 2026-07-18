-- supabase/migrations/0004_polarity_and_color.sql
alter table grid_template add column color text not null default '#888888';
alter table grid_line add column polarity text not null default '+' check (polarity in ('+', '-'));
