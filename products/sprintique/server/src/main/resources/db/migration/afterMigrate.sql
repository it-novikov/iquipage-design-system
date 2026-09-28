-- Runs after every migration. Restores the exact grants of the runtime and worker roles; the role names are
-- validated identifiers supplied by the migrate command, never by a request.
GRANT SELECT ON public.flyway_schema_history TO "${runtime_role}";
GRANT USAGE ON SCHEMA app,auth TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA app TO "${runtime_role}";
GRANT DELETE ON app.task_tags,app.temporal_constraints,app.project_members,app.workspace_members,app.person_avatars TO "${runtime_role}";
-- Previews are transient: the ten-minute plan record is still append-only (UPDATE stays revoked),
-- but an expired plan that was never applied and belongs to no run is collected, not retained forever.
GRANT DELETE ON app.planning_plans TO "${runtime_role}";
REVOKE UPDATE ON app.audit_events,app.messages,app.idempotency FROM "${runtime_role}";
REVOKE UPDATE ON app.planning_plans,app.planning_applied,app.release_snapshots FROM "${runtime_role}";
REVOKE UPDATE ON app.planning_selections FROM "${runtime_role}";
REVOKE UPDATE ON app.task_settings_versions FROM "${runtime_role}";
REVOKE UPDATE ON app.map_versions,app.map_template_versions FROM "${runtime_role}";
REVOKE UPDATE ON app.agent_run_plans FROM "${runtime_role}";
REVOKE UPDATE ON app.workspace_audit FROM "${runtime_role}";
-- Finance history is append-only: versions are written by a trigger and never changed or removed.
REVOKE UPDATE ON app.finance_entry_version FROM "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.principals,auth.credentials TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.project_invitations TO "${runtime_role}";
GRANT SELECT,INSERT,DELETE ON auth.login_states TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.identities TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.email_challenges TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.known_devices TO "${runtime_role}";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO "${runtime_role}";
GRANT USAGE ON SCHEMA work TO "${runtime_role}";
GRANT SELECT,INSERT ON work.jobs TO "${runtime_role}";
GRANT EXECUTE ON FUNCTION work.retry_asset_job(text,uuid) TO "${runtime_role}";
DO $grants$
BEGIN
  IF '${worker_role}' <> '' THEN
    EXECUTE 'GRANT USAGE ON SCHEMA work,app TO "${worker_role}"';
    EXECUTE 'GRANT EXECUTE ON FUNCTION work.claim(text),work.settle(uuid,uuid,boolean,text),work.prepare_asset_gc(uuid,uuid),work.finish_asset_gc(uuid,uuid) TO "${worker_role}"';
  END IF;
END
$grants$;
