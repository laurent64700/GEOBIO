-- supabase/migrations/0006_vibratory_base.sql
alter table grid_template add column vibratory_base integer not null default 7 check (vibratory_base > 0);
alter table grid_line add column reinforced boolean not null default false;
