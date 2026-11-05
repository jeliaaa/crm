-- Run in the Supabase SQL editor.
-- Per-contact rating 1-5 (separate from the "Often responses" dropdown).

alter table contacts add column if not exists rating smallint
  check (rating between 1 and 5);

alter table contact_activities drop constraint if exists contact_activities_type_check;
alter table contact_activities
  add constraint contact_activities_type_check
  check (type in ('status_change', 'comment', 'follow_up', 'interest_change', 'rating_change'));
