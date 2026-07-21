-- supabase/migrations/0011_mission_photo.sql
create table mission_photo (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references mission(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);
create index mission_photo_mission_id_idx on mission_photo(mission_id);
