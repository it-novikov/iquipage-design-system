-- Files up to 2 GiB (2147483648 bytes, one past the integer range): the size becomes bigint.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='app.assets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%10485760%';
  EXECUTE format('ALTER TABLE app.assets DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.assets ALTER COLUMN size TYPE bigint;
ALTER TABLE app.assets ADD CONSTRAINT asset_size CHECK(size BETWEEN 1 AND 2147483648);
