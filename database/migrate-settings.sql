-- Run in Supabase SQL editor: key/value app settings (invoice provider details).

create table if not exists settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz default now()
);
