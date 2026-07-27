-- supabase/migrations/0020_context_object_disable_rls.sql
-- context_object got RLS enabled by default (unlike every other table in
-- this schema, none of which have ever had RLS explicitly managed) —
-- confirmed live 2026-07-27: inserts failed with "new row violates row-level
-- security policy" despite valid data. Aligning with the rest of the schema.
alter table context_object disable row level security;
