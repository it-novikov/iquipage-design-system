-- Files up to 2 GiB (2147483648 bytes, one past the integer range): the size becomes bigint.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='app.assets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%10485760%';
  EXECUTE format('ALTER TABLE app.assets DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.assets ALTER COLUMN size TYPE bigint;
ALTER TABLE app.assets ADD CONSTRAINT asset_size CHECK(size BETWEEN 1 AND 2147483648);
-- While its objects are written to storage (no transaction open), an upload is 'publishing': discarding is refused until the
-- outcome; see prepare_asset_gc below for cleanup.
ALTER TABLE app.assets DROP CONSTRAINT asset_state;
ALTER TABLE app.assets ADD CONSTRAINT asset_state CHECK(state IN ('uploading','publishing','ready','attached','detached','quarantined','deleting','deleted'));
-- Cleanup never races a publication: a job that finds one under way fails and is retried with backoff; a publication
-- untouched for ten minutes is abandoned (its process is gone) and is cleaned like any expired upload.
CREATE OR REPLACE FUNCTION work.prepare_asset_gc(job_id uuid,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job work.jobs;asset app.assets;
BEGIN
  SELECT * INTO job FROM work.jobs WHERE id=job_id AND lease_token=token AND kind='asset.gc' AND state='running' AND lease_until>clock_timestamp() FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION 'LEASE_LOST' USING ERRCODE='55000'; END IF;
  SELECT * INTO asset FROM app.assets WHERE project_id=job.project_id AND id=job.payload->>'assetId' FOR UPDATE;
  IF asset.id IS NULL OR asset.state IN ('attached','deleted') OR asset.expires_at>clock_timestamp() THEN RETURN NULL; END IF;
  IF asset.state='publishing' AND asset.updated_at>clock_timestamp()-interval '10 minutes' THEN RAISE EXCEPTION 'ASSET_PUBLISHING' USING ERRCODE='55000'; END IF;
  UPDATE app.assets SET state='deleting',updated_at=clock_timestamp() WHERE project_id=asset.project_id AND id=asset.id;
  RETURN jsonb_build_object('id',asset.id,'projectId',asset.project_id,'sha256',asset.sha256);
END $$;
REVOKE ALL ON FUNCTION work.prepare_asset_gc(uuid,uuid) FROM PUBLIC;
