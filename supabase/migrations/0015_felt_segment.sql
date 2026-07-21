-- supabase/migrations/0015_felt_segment.sql
create table felt_segment (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  network_name text not null,
  ax double precision not null,
  ay double precision not null,
  bx double precision not null,
  by double precision not null,
  created_at timestamptz not null default now()
);
create index felt_segment_plan_id_idx on felt_segment(plan_id);
