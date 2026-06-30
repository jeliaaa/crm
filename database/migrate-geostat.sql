-- Run this in Supabase SQL editor if you already created the contacts table
-- before switching to the geostat.ge data source.

alter table contacts add column if not exists stat_id bigint;
alter table contacts add column if not exists identification_number text;
alter table contacts add column if not exists region text;
alter table contacts add column if not exists activity_code text;
alter table contacts add column if not exists head text;
alter table contacts add column if not exists partner text;
alter table contacts add column if not exists ownership_type text;
alter table contacts add column if not exists business_size text;

-- unique dedupe key on the geostat Stat_ID
create unique index if not exists contacts_stat_id_key on contacts(stat_id);
create index if not exists contacts_region_idx on contacts(region);
