-- supabase/migrations/0019_context_object.sql
-- Simple contextual furniture/landscape markers (spec: Laurent needs to add
-- an element missing from the aerial photo, e.g. a tree not visible on the
-- IGN imagery, while doing a network survey). Mirrors phenomenon's shape.
create table context_object (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  kind text not null check (kind in (
    'canape', 'table', 'table-ronde', 'lit',
    'arbre-chene', 'arbre-pin', 'haie', 'puits', 'mur-briques', 'mur-pierre', 'route', 'cloture'
  )),
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);
create index context_object_plan_id_idx on context_object(plan_id);
