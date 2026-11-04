-- Run in the Supabase SQL editor.
-- Second status for "Called + answered" contacts: interest level 0-5.

alter table contacts add column if not exists interest_level smallint
  check (interest_level between 0 and 5);

alter table contact_activities drop constraint if exists contact_activities_type_check;
alter table contact_activities
  add constraint contact_activities_type_check
  check (type in ('status_change', 'comment', 'follow_up', 'interest_change'));
