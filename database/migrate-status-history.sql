-- Run in Supabase SQL editor: new status set + activity/history timeline.

-- 1. Migrate existing rows to the new status vocabulary.
update contacts set stage = 'follow_up' where stage in ('contacted', 'qualified');

-- 2. Swap the CHECK constraint for the new statuses.
alter table contacts drop constraint if exists contacts_stage_check;
alter table contacts
  add constraint contacts_stage_check
  check (stage in ('lead', 'follow_up', 'won', 'lost', 'didnt_answer'));

-- 3. Activity timeline: status changes, comments, follow-ups.
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
