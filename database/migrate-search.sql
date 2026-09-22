-- Run in the Supabase SQL editor.
-- Universal contact search: one blob column holding every searchable field,
-- a digits-only mirror of the phone numbers, and trigram indexes so the
-- "%needle%" lookups behind the search bar stay fast on a fully scraped
-- table.
--
-- lib/contactSearch.ts detects whether this ran and falls back to an ilike
-- per column when it hasn't, so the search bar works either way — this
-- migration is a speed and coverage upgrade (it adds categories[],
-- established_year and stat_id to the haystack), not a requirement.
--
-- Note: both columns are STORED, so this rewrites the contacts table once.

create extension if not exists pg_trgm;

-- Generated columns only accept IMMUTABLE expressions and array_to_string()
-- is declared STABLE, so the concat lives in a wrapper we declare immutable.
-- The result is deterministic either way.
create or replace function contacts_search_blob(
  p_name text,
  p_identification_number text,
  p_head text,
  p_partner text,
  p_phone text,
  p_mobile text,
  p_email text,
  p_website text,
  p_address text,
  p_city text,
  p_region text,
  p_category text,
  p_activity_code text,
  p_categories text[],
  p_ownership_type text,
  p_business_size text,
  p_description text,
  p_notes text,
  p_established_year integer,
  p_stat_id bigint
) returns text language sql immutable as $$
  select concat_ws(' ',
    p_name, p_identification_number, p_head, p_partner,
    p_phone, p_mobile, p_email, p_website,
    p_address, p_city, p_region,
    p_category, p_activity_code, array_to_string(p_categories, ' '),
    p_ownership_type, p_business_size,
    p_description, p_notes,
    p_established_year::text, p_stat_id::text
  );
$$;

alter table contacts
  add column if not exists search_text text
  generated always as (contacts_search_blob(
    name, identification_number, head, partner,
    phone, mobile, email, website,
    address, city, region,
    category, activity_code, categories,
    ownership_type, business_size,
    description, notes,
    established_year, stat_id
  )) stored;

-- Numbers are stored however they were scraped ("595 27 71 71", "+995 32 211
-- 44 11") but typed into the search bar as a solid run of digits. Keeping a
-- punctuation-free copy makes both shapes line up. Same idea as phone_key()
-- in migrate-call-webhook.sql, minus the last-9-digits trim so a search can
-- decide for itself how much of the number to use.
alter table contacts
  add column if not exists phone_digits text
  generated always as (
    regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') || ' ' ||
    regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g')
  ) stored;

create index if not exists contacts_search_text_trgm_idx
  on contacts using gin (search_text gin_trgm_ops);

create index if not exists contacts_phone_digits_trgm_idx
  on contacts using gin (phone_digits gin_trgm_ops);

-- PostgREST caches the schema; nudge it so the new columns are queryable
-- without waiting for the next reload.
notify pgrst, 'reload schema';
