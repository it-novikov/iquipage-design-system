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
-- The runtime role writes finance as the person of the request, at the moment of the request: the version a trigger
-- records takes its author and time from the row, so neither may be set by hand. A data import on the owner role
-- carries its own authors and times; these restrictive policies apply to the runtime role only.
DROP POLICY IF EXISTS finance_entry_runtime_insert ON app.finance_entry;
CREATE POLICY finance_entry_runtime_insert ON app.finance_entry AS RESTRICTIVE FOR INSERT TO "${runtime_role}"
  WITH CHECK(created_by=auth.actor_id() AND updated_by=auth.actor_id() AND created_at>=now() AND updated_at>=now());
DROP POLICY IF EXISTS finance_entry_runtime_update ON app.finance_entry;
CREATE POLICY finance_entry_runtime_update ON app.finance_entry AS RESTRICTIVE FOR UPDATE TO "${runtime_role}"
  USING(true) WITH CHECK(updated_by=auth.actor_id() AND updated_at>=now());
DROP POLICY IF EXISTS finance_settings_runtime_insert ON app.finance_settings;
CREATE POLICY finance_settings_runtime_insert ON app.finance_settings AS RESTRICTIVE FOR INSERT TO "${runtime_role}"
  WITH CHECK(updated_by=auth.actor_id() AND updated_at>=now());
DROP POLICY IF EXISTS finance_settings_runtime_update ON app.finance_settings;
CREATE POLICY finance_settings_runtime_update ON app.finance_settings AS RESTRICTIVE FOR UPDATE TO "${runtime_role}"
  USING(true) WITH CHECK(updated_by=auth.actor_id() AND updated_at>=now());
-- Workbench: meaningful task events and private receipts are append-only (docs/adr W2, W3).
REVOKE UPDATE ON app.task_activity,app.private_receipts FROM "${runtime_role}";
-- AI connections and agent runs (V20261001000064–67, docs/decisions/0005-ai-agents.md): sealed keys are reached only
-- through functions that check the caller; run steps are append-only; runs are created and advanced only by the queue
-- functions of the runner, which the runtime role calls.
REVOKE ALL ON app.ai_connection_secrets FROM "${runtime_role}";
REVOKE UPDATE ON app.ai_agent_run_steps FROM "${runtime_role}";
GRANT EXECUTE ON FUNCTION app.ai_is_owner(regclass),app.ai_store_connection_secret(uuid,bytea,integer),
  app.ai_connection_secret(uuid),app.ai_forget_connection_secret(uuid),app.ai_run_enqueue(text,text,text,text),
  app.ai_run_claim(integer),app.ai_run_load(uuid,uuid),app.ai_run_attach(uuid,uuid,text),
  app.ai_run_step(uuid,uuid,text,text,text,text,text,integer,integer,bigint),app.ai_run_heartbeat(uuid,uuid,integer,jsonb),
  app.ai_run_finish(uuid,uuid,text,text,text),app.ai_run_mention(text,text,text),
  app.ai_initiator_active(text,text),app.ai_initiator_permissions(text,text) TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.principals,auth.credentials TO "${runtime_role}";
-- Invitations (V20260930000039) are revoked, replaced or accepted, never deleted: their history stays.
GRANT SELECT,INSERT,UPDATE ON auth.invitations TO "${runtime_role}";
GRANT SELECT,INSERT,DELETE ON auth.login_states TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.identities TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.email_challenges TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.known_devices TO "${runtime_role}";
-- Delegated access (V20260929000027). Codes, refresh tokens and never-used clients are collected when they expire;
-- grants are revoked, not deleted, so the history of connected apps stays.
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.oauth_clients,auth.oauth_codes,auth.oauth_refresh_tokens TO "${runtime_role}";
GRANT SELECT,INSERT,UPDATE ON auth.oauth_grants TO "${runtime_role}";
GRANT SELECT,INSERT ON auth.access_events TO "${runtime_role}";
-- Service accounts are deleted by marking them; their principal and history stay.
GRANT SELECT,INSERT,UPDATE ON auth.service_accounts TO "${runtime_role}";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO "${runtime_role}";
-- Notifications (V20261001000042–044): raised only through the functions below; a person changes only when they read
-- one. A Telegram chat is unlinked by its person; the queue and the webhook ledger belong to the functions alone.
REVOKE INSERT,UPDATE ON app.notifications FROM "${runtime_role}";
GRANT UPDATE(read_at) ON app.notifications TO "${runtime_role}";
REVOKE UPDATE ON app.telegram_link_tokens FROM "${runtime_role}";
GRANT DELETE ON app.telegram_connections TO "${runtime_role}";
REVOKE INSERT,UPDATE ON app.telegram_connections,app.telegram_deliveries,app.telegram_updates FROM "${runtime_role}";
GRANT EXECUTE ON FUNCTION app.notify_mention(text,text,text),app.telegram_accept_update(bigint),
  app.telegram_link_chat(text,bigint,text),app.telegram_unlink_chat(bigint) TO "${runtime_role}";
GRANT USAGE ON SCHEMA work TO "${runtime_role}";
GRANT SELECT,INSERT ON work.jobs TO "${runtime_role}";
GRANT EXECUTE ON FUNCTION work.retry_asset_job(text,uuid) TO "${runtime_role}";
DO $grants$
BEGIN
  IF '${worker_role}' <> '' THEN
    EXECUTE 'GRANT USAGE ON SCHEMA work,app TO "${worker_role}"';
    EXECUTE 'GRANT EXECUTE ON FUNCTION work.claim(text),work.settle(uuid,uuid,boolean,text),work.prepare_asset_gc(uuid,uuid),work.finish_asset_gc(uuid,uuid) TO "${worker_role}"';
    EXECUTE 'GRANT EXECUTE ON FUNCTION work.raise_due_notifications(),work.claim_telegram_delivery(),work.settle_telegram_delivery(uuid,uuid,text,text,integer) TO "${worker_role}"';
  END IF;
END
$grants$;
