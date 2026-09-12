CREATE SCHEMA work;
REVOKE ALL ON SCHEMA work FROM PUBLIC;
CREATE TABLE work.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL REFERENCES app.projects,
  kind text NOT NULL CHECK(kind IN ('asset.gc','agent.run','outbox.dispatch')),dedupe_key text NOT NULL,
  payload jsonb NOT NULL CHECK(octet_length(payload::text)<=16384),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,lease_until timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
  UNIQUE(project_id,kind,dedupe_key)
);
ALTER TABLE work.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work.jobs FORCE ROW LEVEL SECURITY;
-- Only the function owner can see the cross-tenant queue. API runtime retains tenant RLS.
CREATE POLICY queue_access ON work.jobs USING(auth.can_project(project_id) OR current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='work.jobs'::regclass)))
  WITH CHECK(auth.can_project(project_id) OR current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='work.jobs'::regclass)));
CREATE INDEX jobs_available ON work.jobs(kind,available_at) WHERE state IN ('pending','running');
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='app.assets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%quarantined%';
  EXECUTE format('ALTER TABLE app.assets DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.assets ADD CONSTRAINT asset_state CHECK(state IN ('uploading','ready','attached','detached','quarantined','deleting','deleted'));
-- Narrow worker functions below need exactly this table; no general tenant bypass is granted to the worker role.
CREATE POLICY asset_worker ON app.assets USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='app.assets'::regclass)))
  WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='app.assets'::regclass)));

CREATE FUNCTION work.claim(requested_kind text) RETURNS SETOF work.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected uuid;
BEGIN
  UPDATE work.jobs SET state='failed',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_error='ATTEMPTS_EXHAUSTED'
    WHERE kind=requested_kind AND attempts>=10 AND ((state='pending' AND available_at<=clock_timestamp()) OR (state='running' AND lease_until<clock_timestamp()));
  SELECT id INTO selected FROM work.jobs WHERE kind=requested_kind AND attempts<10
    AND ((state='pending' AND available_at<=clock_timestamp()) OR (state='running' AND lease_until<clock_timestamp()))
    ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF selected IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE work.jobs SET state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    WHERE id=selected RETURNING *;
END $$;
CREATE FUNCTION work.settle(job_id uuid,token uuid,succeeded boolean,error_code text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE updated integer;
BEGIN
  UPDATE work.jobs SET state=CASE WHEN succeeded THEN 'done' WHEN attempts>=10 THEN 'failed' ELSE 'pending' END,
    available_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,attempts)::integer)),
    completed_at=CASE WHEN succeeded OR attempts>=10 THEN clock_timestamp() ELSE NULL END,
    lease_token=NULL,lease_until=NULL,last_error=CASE WHEN succeeded THEN NULL ELSE left(coalesce(error_code,'WORKER_FAILED'),80) END
    WHERE id=job_id AND lease_token=token AND state='running' AND lease_until>clock_timestamp();
  GET DIAGNOSTICS updated=ROW_COUNT;RETURN updated=1;
END $$;
CREATE FUNCTION work.prepare_asset_gc(job_id uuid,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job work.jobs;asset app.assets;
BEGIN
  SELECT * INTO job FROM work.jobs WHERE id=job_id AND lease_token=token AND kind='asset.gc' AND state='running' AND lease_until>clock_timestamp() FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION 'LEASE_LOST' USING ERRCODE='55000'; END IF;
  SELECT * INTO asset FROM app.assets WHERE project_id=job.project_id AND id=job.payload->>'assetId' FOR UPDATE;
  IF asset.id IS NULL OR asset.state IN ('attached','deleted') OR asset.expires_at>clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE app.assets SET state='deleting',updated_at=clock_timestamp() WHERE project_id=asset.project_id AND id=asset.id;
  RETURN jsonb_build_object('id',asset.id,'projectId',asset.project_id,'sha256',asset.sha256);
END $$;
CREATE FUNCTION work.finish_asset_gc(job_id uuid,token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job work.jobs;
BEGIN
  SELECT * INTO job FROM work.jobs WHERE id=job_id AND lease_token=token AND kind='asset.gc' AND state='running' AND lease_until>clock_timestamp() FOR UPDATE;
  IF job.id IS NULL THEN RETURN false; END IF;
  UPDATE app.assets SET state='deleted',revision=revision+1,updated_at=clock_timestamp() WHERE project_id=job.project_id AND id=job.payload->>'assetId' AND state='deleting';
  RETURN work.settle(job_id,token,true,NULL);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA work FROM PUBLIC;
