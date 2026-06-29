-- Run this in your Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists contacts (
  id            uuid        default gen_random_uuid() primary key,
  name          text        not null,
  phone         text,
  mobile        text,
  email         text,
  website       text,
  address       text,
  city          text,
  category      text,
  categories    text[]      default '{}',
  description   text,
  source_url    text        unique,
  established_year integer,
  stage         text        default 'lead'
                            check (stage in ('lead','contacted','qualified','won','lost')),
  notes         text        default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists contacts_stage_idx    on contacts(stage);
create index if not exists contacts_city_idx     on contacts(city);
create index if not exists contacts_category_idx on contacts(category);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();
