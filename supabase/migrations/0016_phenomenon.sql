-- supabase/migrations/0016_phenomenon.sql
create table phenomenon (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  kind text not null check (kind in (
    'cheminee-1', 'cheminee-2', 'cheminee-3', 'cheminee-4',
    'spire-vortex', 'point-cosmique', 'carre-magique', 'tube-magique'
  )),
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);
create index phenomenon_plan_id_idx on phenomenon(plan_id);
