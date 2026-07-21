-- supabase/migrations/0001_plan1_schema.sql
create extension if not exists postgis;
create extension if not exists pgcrypto; -- gen_random_uuid()

create table mission (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  mission_date date not null,
  declination_deg double precision,
  created_at timestamptz not null default now()
);

create table plan (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references mission(id) on delete cascade,
  kind text not null check (kind in ('exterieur', 'interieur')),
  image_url text,
  -- affine transform {a,b,c,d,e,f} mapping image pixel -> mission-local metric (x,y);
  -- null for 'exterieur' plans, which read coordinates directly off the IGN base layer
  calibration jsonb,
  created_at timestamptz not null default now(),
  constraint interieur_requires_image check (
    kind = 'exterieur' or (kind = 'interieur' and image_url is not null)
  )
);

create table grid_template (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  spacing_x_m double precision not null check (spacing_x_m > 0),
  spacing_y_m double precision not null check (spacing_y_m > 0),
  angle_true_north_deg double precision not null,
  origin_offset_x double precision not null default 0,
  origin_offset_y double precision not null default 0,
  created_at timestamptz not null default now()
);

create table grid_instance (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  -- frozen copy of the grid_template row at generation time (see spec §6.1:
  -- editing a template later must never retroactively change existing instances)
  template_snapshot jsonb not null,
  origin_x double precision not null,
  origin_y double precision not null,
  created_at timestamptz not null default now()
);

create table grid_line (
  id uuid primary key default gen_random_uuid(),
  grid_instance_id uuid not null references grid_instance(id) on delete cascade,
  -- 'axis-a' or 'axis-b': the two perpendicular line families of a grid (see §6.1 Chunk 2)
  family text not null check (family in ('axis-a', 'axis-b')),
  theoretical_points jsonb not null, -- [{x,y}, ...] straight line as generated
  adjusted_points jsonb not null,    -- [{x,y}, ...] current, possibly deformed line
  created_at timestamptz not null default now()
);

create table freeform_network (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  kind text not null check (kind in ('eau', 'faille')),
  points jsonb not null, -- [{x,y}, ...]
  created_at timestamptz not null default now()
);

create index on plan (mission_id);
create index on grid_instance (plan_id);
create index on grid_line (grid_instance_id);
create index on freeform_network (plan_id);
