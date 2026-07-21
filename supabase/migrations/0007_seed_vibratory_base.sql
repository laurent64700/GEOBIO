-- supabase/migrations/0007_seed_vibratory_base.sql
-- Values below come from the same physical reference manual as migration
-- 0005's spacing/color seeds (see that migration's header for provenance notes).
update grid_template set vibratory_base = 7 where name = 'Hartmann';
update grid_template set vibratory_base = 5 where name = 'Curry';
update grid_template set vibratory_base = 7 where name = 'Palm';
update grid_template set vibratory_base = 9 where name = 'Peyré';
update grid_template set vibratory_base = 5 where name = 'Wissmann';
