-- Run this in your Supabase SQL editor (fresh install)

create extension if not exists "pgcrypto";

create table if not exists contacts (
  id            uuid        default gen_random_uuid() primary key,
  stat_id       bigint      unique,                -- geostat Stat_ID (dedupe key)
  name          text        not null,
  identification_number text,                      -- legal/tax code
  phone         text,
  mobile        text,
  email         text,
  website       text,
  address       text,
  city          text,
  region        text,
  category      text,                              -- NACE section, e.g. "Real estate"
  activity_code text,                              -- specific NACE code, e.g. "70.20.2"
  categories    text[]      default '{}',          -- specific NACE activity names
  head          text,
  partner       text,
  ownership_type text,
  business_size text,
  description   text,
  source_url    text        unique,
  established_year integer,
  stage         text        default 'lead'
                            check (stage in ('lead','follow_up','done','lost','didnt_answer')),
  notes         text        default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists contacts_stage_idx    on contacts(stage);
create index if not exists contacts_city_idx     on contacts(city);
create index if not exists contacts_region_idx   on contacts(region);
create index if not exists contacts_category_idx on contacts(category);
create index if not exists contacts_identification_idx on contacts(identification_number);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();

-- Activity timeline: status changes, comments, follow-ups.
create table if not exists contact_activities (
  id             uuid        default gen_random_uuid() primary key,
  contact_id     uuid        not null references contacts(id) on delete cascade,
  type           text        not null check (type in ('status_change', 'comment', 'follow_up')),
  from_stage     text,
  to_stage       text,
  comment        text,
  follow_up_date date,
  created_at     timestamptz default now()
);

create index if not exists contact_activities_contact_idx
  on contact_activities(contact_id, created_at desc);

-- Daily stage snapshots (taken 18:00 Tbilisi) for 24h difference tracking.
create table if not exists stage_snapshots (
  snapshot_date date        primary key,
  lead          integer     not null default 0,
  follow_up     integer     not null default 0,
  done          integer     not null default 0,
  lost          integer     not null default 0,
  didnt_answer  integer     not null default 0,
  total         integer     not null default 0,
  created_at    timestamptz default now()
);
