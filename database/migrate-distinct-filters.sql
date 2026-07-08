-- Run in Supabase SQL editor: proper DISTINCT lookups for the contact filters.
-- The contacts page previously derived filter options from a 200-row sample,
-- so newly imported categories/cities didn't appear. These functions return
-- the true distinct sets.

create or replace function distinct_categories()
returns table(value text) language sql stable as $$
  select distinct category
  from contacts
  where category is not null and category <> ''
  order by 1;
$$;

create or replace function distinct_cities()
returns table(value text) language sql stable as $$
  select distinct city
  from contacts
  where city is not null and city <> ''
  order by 1;
$$;
