CREATE FUNCTION work.retry_asset_job(target_project text,target_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
  IF NOT auth.can_project(target_project) OR NOT EXISTS(
    SELECT 1 FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id
    WHERE m.project_id=target_project AND m.principal_id=auth.actor_id() AND m.role='admin' AND p.kind='human' AND p.disabled_at IS NULL
  ) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE work.jobs SET state='pending',attempts=0,available_at=clock_timestamp(),completed_at=NULL,last_error=NULL,lease_token=NULL,lease_until=NULL
    WHERE id=target_job AND project_id=target_project AND state='failed' AND kind='asset.gc';
  GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION work.retry_asset_job(text,uuid) FROM PUBLIC;
