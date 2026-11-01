-- Gives the app role ownership of the dev tables so it can run migrations.
-- Run once as postgres. Safe to run again. Changes no row data.
--
--   psql -U postgres -h localhost -d partyparadise -f scripts/fix_dev_table_owner.sql

DO $$
DECLARE
    item record;
BEGIN
    FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO partypeople', item.tablename);
    END LOOP;
END $$;

-- Needed for migrations that create tables
GRANT CREATE ON SCHEMA public TO partypeople;
