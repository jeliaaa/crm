-- Run in the Supabase SQL editor.
-- Adds the CityNet call webhook: the "called_answered" stage, the
-- action-required flag behind it, a log of incoming call events, and a
-- phone lookup that ignores formatting.

-- 1. New pipeline stage: called + answered.
alter table contacts drop constraint if exists contacts_stage_check;
alter table contacts
  add constraint contacts_stage_check
  check (stage in ('lead', 'called_answered', 'follow_up', 'done', 'lost', 'didnt_answer'));

-- 2. "Needs an action" flag — set when a call is answered, cleared once a
--    human deals with the contact. Drives the red dot in the sidebar.
alter table contacts add column if not exists action_required boolean not null default false;

create index if not exists contacts_action_required_idx
  on contacts(action_required) where action_required;

-- 3. Daily snapshots need a column per stage.
alter table stage_snapshots add column if not exists called_answered integer not null default 0;

-- 4. Raw log of every call the PBX pushes at us. unique_id gives us
--    idempotency: CityNet retries land on the same row and are ignored.
create table if not exists call_events (
  id                  uuid        default gen_random_uuid() primary key,
  unique_id           text        unique,
  call_time           timestamptz,
  direction           text,                      -- 'in' | 'out'
  src                 text,
  dst                 text,
  operator            text,
  mobile              text,
  duration            integer,                   -- seconds
  status              text,                      -- 'ANSWERED', 'NO ANSWER', 'BUSY', …
  recording_url       text,
  meta_data           text,
  matched_phone       text,                      -- the number we looked contacts up by
  matched_contact_ids uuid[]      default '{}',
  applied_stage       text,                      -- stage we moved matches to, null if none
  raw                 jsonb,
  created_at          timestamptz default now()
);

create index if not exists call_events_call_time_idx on call_events(call_time desc);
create index if not exists call_events_matched_idx   on call_events using gin(matched_contact_ids);

-- 5. Phone lookup. Contacts store numbers in whatever shape they were
--    scraped in ("595900591", "595 27 71 71"), and the PBX sends E.164-ish
--    digits ("995322114411"). Comparing the last 9 digits — the length of a
--    Georgian national number — matches across both.
create or replace function phone_key(p text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9);
$$;

create index if not exists contacts_phone_key_idx  on contacts(phone_key(phone));
create index if not exists contacts_mobile_key_idx on contacts(phone_key(mobile));

create or replace function find_contacts_by_phone(p_digits text)
returns setof contacts language sql stable as $$
  select *
  from contacts
  where length(phone_key(p_digits)) = 9
    and (phone_key(phone) = phone_key(p_digits) or phone_key(mobile) = phone_key(p_digits));
$$;
