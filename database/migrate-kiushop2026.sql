-- Migrates the existing kiushop2026 schema to the one the data dump expects.
-- Run:  psql -U postgres -d kiushop2026 -v ON_ERROR_STOP=1 -f database/migrate-kiushop2026.sql
-- WARNING: empties city, customer, customer_order, delivery_station, item,
-- offered_languages and product (the dump is a full reload).

BEGIN;

-- 1. Drop every FK / PK / unique / check constraint on the affected tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS t, conname
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND contype IN ('f','p','u','c')
      AND conrelid::regclass::text IN
        ('city','customer','customer_order','delivery_station','item','offered_languages','product')
    ORDER BY (contype = 'f') DESC
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE', r.t, r.conname);
  END LOOP;
END $$;

TRUNCATE city, customer, customer_order, delivery_station, item, offered_languages, product;

-- 2. offered_languages -> lang
ALTER TABLE offered_languages RENAME TO lang;
ALTER TABLE lang RENAME COLUMN code TO lang_code;

-- 3. customer
ALTER TABLE customer RENAME COLUMN date_of_birth    TO birthday;
ALTER TABLE customer RENAME COLUMN recruiter        TO recruited_by;
ALTER TABLE customer RENAME COLUMN selected_language TO lang_code;

-- 4. delivery_station -> station
ALTER TABLE delivery_station RENAME TO station;
ALTER TABLE station RENAME COLUMN station_number TO station_id;
ALTER TABLE station RENAME COLUMN assigned_to    TO city;
ALTER TABLE station ALTER COLUMN station_id TYPE integer USING station_id::integer;
ALTER TABLE station ADD COLUMN postalcode integer;

-- 5. customer_order -> orders
ALTER TABLE customer_order RENAME TO orders;
ALTER TABLE orders RENAME COLUMN order_date    TO o_date;
ALTER TABLE orders RENAME COLUMN delivery_date TO d_date;
ALTER TABLE orders RENAME COLUMN order_status  TO status;
ALTER TABLE orders RENAME COLUMN customer      TO cu_email;
ALTER TABLE orders RENAME COLUMN delivered_to  TO city;
ALTER TABLE orders ALTER COLUMN order_id TYPE integer USING order_id::integer;
ALTER TABLE orders ADD COLUMN station_id integer;

-- make sure the enum accepts the statuses used by the data
DO $$
DECLARE t text;
BEGIN
  SELECT format('%I.%I', n.nspname, ty.typname) INTO t
  FROM pg_attribute a
  JOIN pg_type ty ON ty.oid = a.atttypid
  JOIN pg_namespace n ON n.oid = ty.typnamespace
  WHERE a.attrelid = 'orders'::regclass AND a.attname = 'status' AND ty.typtype = 'e';
  IF t IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', t, 'started');
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', t, 'completed');
  END IF;
END $$;

-- 6. item
ALTER TABLE item RENAME COLUMN item_number TO item_id;
ALTER TABLE item ALTER COLUMN order_id   TYPE integer USING order_id::integer;
ALTER TABLE item ALTER COLUMN product_id TYPE integer USING product_id::integer;
ALTER TABLE item DROP COLUMN total_price;
ALTER TABLE item ADD COLUMN total_price numeric GENERATED ALWAYS AS (unit_price * quantity) STORED;

-- 7. product
ALTER TABLE product ALTER COLUMN product_id TYPE integer USING product_id::integer;
ALTER TABLE product ALTER COLUMN price TYPE numeric(10,2);
ALTER TABLE product ADD COLUMN promotion boolean NOT NULL DEFAULT false;

-- 8. Re-create keys (FKs deferred so the dump can load in any order inside one transaction)
ALTER TABLE city     ADD PRIMARY KEY (city_name);
ALTER TABLE lang     ADD PRIMARY KEY (lang_code);
ALTER TABLE product  ADD PRIMARY KEY (product_id);
ALTER TABLE customer ADD PRIMARY KEY (email);
ALTER TABLE station  ADD PRIMARY KEY (city, station_id);
ALTER TABLE orders   ADD PRIMARY KEY (order_id);
ALTER TABLE item     ADD PRIMARY KEY (order_id, item_id);

ALTER TABLE customer ADD FOREIGN KEY (lang_code)    REFERENCES lang(lang_code)   DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE customer ADD FOREIGN KEY (recruited_by) REFERENCES customer(email)   DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE station  ADD FOREIGN KEY (city)         REFERENCES city(city_name)   DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE orders   ADD FOREIGN KEY (cu_email)     REFERENCES customer(email)   DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE orders   ADD FOREIGN KEY (city, station_id) REFERENCES station(city, station_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE item     ADD FOREIGN KEY (order_id)     REFERENCES orders(order_id)  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE item     ADD FOREIGN KEY (product_id)   REFERENCES product(product_id) DEFERRABLE INITIALLY DEFERRED;

-- 9. Cities referenced by the dump
INSERT INTO city (city_name) VALUES ('Berlin'), ('Munich'), ('Tbilissi'), ('Paris');

COMMIT;
