-- One-time backfill: contacts ingested on 2026-07-15 via api/ingest/contacts
-- should carry category = 'BREVO'.
UPDATE contacts
SET category = 'BREVO'
WHERE created_at::date = '2026-07-15';
