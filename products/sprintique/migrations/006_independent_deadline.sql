-- A contractual deadline is a target, not the end of the planned interval.
-- Late plans must remain representable instead of becoming unsavable records.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
    WHERE conrelid='app.tasks'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%planned_start%' AND pg_get_constraintdef(oid) LIKE '%due%';
  EXECUTE format('ALTER TABLE app.tasks DROP CONSTRAINT %I',constraint_name);
END $$;
