-- Run in Supabase SQL editor: rename the "won" status to "done".

-- 1. Drop the old constraint so we can rewrite the values.
alter table contacts drop constraint if exists contacts_stage_check;

-- 2. Rename existing data.
update contacts set stage = 'done' where stage = 'won';
update contact_activities set from_stage = 'done' where from_stage = 'won';
update contact_activities set to_stage = 'done' where to_stage = 'won';

-- 3. Re-add the constraint with the new value.
alter table contacts
  add constraint contacts_stage_check
  check (stage in ('lead', 'follow_up', 'done', 'lost', 'didnt_answer'));
