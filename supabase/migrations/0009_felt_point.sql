create table felt_point (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  network_name text not null,
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);
create index felt_point_plan_id_idx on felt_point(plan_id);
