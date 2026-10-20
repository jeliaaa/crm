-- Run in the Supabase SQL editor (after migrate-call-webhook.sql, which
-- defines phone_key()).
--
-- Duplicate FLAGGING. Nothing is deleted, merged or blocked: the contacts
-- table calls contact_duplicates() for the rows on screen and shows, for each
-- one, the other copies of the same company, when the first record appeared
-- and the status of each copy.
--
-- Why not "same name = same company": Georgian company names are short and
-- reused ("შპს გიო" exists 7 times, each with its own tax ID). So two rows are
-- only treated as the same company when
--   * they share an identification_number
--   * the names match once legal forms are stripped AND they share a phone
--   * the names match, one side has no tax ID, and no other tax ID competes
--     for that name                                 (flagged as "probable")
-- Two different tax IDs are never treated as the same company.

-- 1. Name normalisation: "შპს შპს ალფა", 'შპს „ალფა"', "ალფა LLC" -> "ალფა".
create or replace function contact_name_key(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p, '')),
          '[\s"''„“”«»`´‘’()\[\]{}.,;:!?+\-–—_/\\*#№|&]+', ' ', 'g'),
        '^\s*(?:(?:ი მ ინდივიდუალური მეწარმე|ინდივიდუალური მეწარმე|შპს|სს|ააიპ|სსიპ|ი მ|შ პ ს|ს ს|llc|ltd|jsc)\s+)+', '', 'g'),
      '(?:\s+(?:შპს|სს|llc|ltd|jsc))+\s*$', '', 'g'),
    '\s+', ' ', 'g'));
$$;

create index if not exists contacts_name_key_idx on contacts(contact_name_key(name));

-- 2. For each requested contact, every other row that is the same company.
create or replace function contact_duplicates(p_ids uuid[])
returns table(
  contact_id uuid,
  dup_id uuid,
  dup_name text,
  dup_stage text,
  dup_created_at timestamptz,
  strength text
)
language sql stable as $$
  with c as (
    select id,
           contact_name_key(name) as nk,
           nullif(btrim(identification_number), '') as ident,
           array_remove(array[
             case when length(phone_key(phone))  = 9 then phone_key(phone)  end,
             case when length(phone_key(mobile)) = 9 then phone_key(mobile) end
           ], null) as phones
    from contacts
    where id = any(p_ids)
  ),
  o as (
    -- Every row sharing a name key or a tax ID with a requested one.
    select x.id, x.name, x.stage, x.created_at,
           contact_name_key(x.name) as nk,
           nullif(btrim(x.identification_number), '') as ident,
           array_remove(array[
             case when length(phone_key(x.phone))  = 9 then phone_key(x.phone)  end,
             case when length(phone_key(x.mobile)) = 9 then phone_key(x.mobile) end
           ], null) as phones
    from contacts x
    where contact_name_key(x.name) in (select nk from c where length(nk) >= 3)
       or btrim(x.identification_number) in (select ident from c where ident is not null)
  ),
  competing as (
    select nk, count(distinct ident) as idents from o group by nk
  )
  select c.id, o.id, o.name, o.stage, o.created_at,
         case when c.ident is not null and c.ident = o.ident then 'certain'
              when c.phones && o.phones then 'certain'
              else 'probable' end
  from c
  join o on o.id <> c.id
  left join competing k on k.nk = o.nk
  where (c.ident is not null and c.ident = o.ident)
     or (length(c.nk) >= 3 and c.nk = o.nk
         and (c.ident is null or o.ident is null)
         and (c.phones && o.phones or coalesce(k.idents, 0) <= 1));
$$;
