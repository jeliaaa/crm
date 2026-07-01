-- Run in Supabase SQL editor: daily stage snapshots for 24h difference tracking.

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
