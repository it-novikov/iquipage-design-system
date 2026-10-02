-- A budget of tokens for one run of a service-account agent (docs/decisions/0005-ai-agents.md). The step limit and the
-- limit of answer tokens per step do not bound what a run costs: every call sends the whole conversation again, so the
-- tokens a run spends grow with each step. The runner stops a run (TOKEN_LIMIT) before a model call once the input and
-- output tokens the provider reported for the run reach this budget.
ALTER TABLE app.ai_agent_profiles ADD COLUMN max_run_tokens integer NOT NULL DEFAULT 500000
  CHECK(max_run_tokens BETWEEN 10000 AND 5000000);
ALTER TABLE app.ai_agent_runs ADD COLUMN max_run_tokens integer NOT NULL DEFAULT 500000
  CHECK(max_run_tokens BETWEEN 10000 AND 5000000);

-- As in V20261001000065, and the run takes the budget of its agent when it is queued.
CREATE OR REPLACE FUNCTION app.ai_run_enqueue(target_project text, target_task text, account text, run_trigger text)
RETURNS TABLE(run_id uuid, run_state text, run_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE profile app.ai_agent_profiles; existing app.ai_agent_runs; recent integer; requester text := auth.actor_id();
  created uuid := gen_random_uuid();
BEGIN
  IF requester IS NULL OR run_trigger NOT IN ('assigned','manual') OR NOT auth.can_project(target_project) THEN RETURN; END IF;
  SELECT p.* INTO profile FROM app.ai_agent_profiles p
    JOIN app.ai_connections c ON c.id=p.connection_id AND c.deleted_at IS NULL
    JOIN app.project_members m ON m.project_id=target_project AND m.principal_id=p.principal_id
    JOIN app.projects x ON x.id=target_project AND x.workspace_id=p.workspace_id
  WHERE p.principal_id=account AND p.enabled AND auth.service_account_active(account);
  IF profile.principal_id IS NULL OR (run_trigger='assigned' AND NOT profile.on_assignment) THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.tasks t WHERE t.project_id=target_project AND t.id=target_task AND t.result='open') THEN
    RETURN;
  END IF;
  -- One decision per account at a time: two assignments racing cannot both take the last run of the hour.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-run:'||account,0));
  SELECT r.* INTO existing FROM app.ai_agent_runs r
  WHERE r.project_id=target_project AND r.task_id=target_task AND r.account_id=account AND r.state IN ('queued','running');
  IF existing.id IS NOT NULL THEN
    RETURN QUERY SELECT existing.id, existing.state, existing.error_code;
    RETURN;
  END IF;
  SELECT count(*) INTO recent FROM app.ai_agent_runs r
  WHERE r.account_id=account AND r.created_at>clock_timestamp()-interval '1 hour' AND r.error_code IS DISTINCT FROM 'RUN_LIMIT';
  INSERT INTO app.ai_agent_runs(project_id,id,task_id,account_id,connection_id,model,trigger,requested_by,state,max_steps,
    max_output_tokens,max_run_tokens,error_code,finished_at)
  VALUES(target_project,created,target_task,account,profile.connection_id,profile.model,run_trigger,requester,
    CASE WHEN recent>=profile.runs_per_hour THEN 'failed' ELSE 'queued' END,profile.max_steps,profile.max_output_tokens,
    profile.max_run_tokens,
    CASE WHEN recent>=profile.runs_per_hour THEN 'RUN_LIMIT' END,
    CASE WHEN recent>=profile.runs_per_hour THEN clock_timestamp() END);
  RETURN QUERY SELECT r.id, r.state, r.error_code FROM app.ai_agent_runs r WHERE r.project_id=target_project AND r.id=created;
END $$;

-- As in V20261001000065, with the budget and the tokens the run has spent so far.
CREATE OR REPLACE FUNCTION app.ai_run_load(run uuid, lease uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object(
    'projectId',r.project_id,'id',r.id,'taskId',r.task_id,'accountId',r.account_id,'trigger',r.trigger,
    'requestedBy',r.requested_by,'model',r.model,'maxSteps',r.max_steps,'maxOutputTokens',r.max_output_tokens,
    'maxRunTokens',r.max_run_tokens,'tokensUsed',r.input_tokens+r.output_tokens,
    'stepsUsed',r.steps_used,'credentialId',r.credential_id,'transcript',r.transcript,'deadlineAt',r.deadline_at,
    'cancelRequested',r.cancel_requested_at IS NOT NULL,'attempts',r.attempts,
    'accountName',coalesce(a.profile_name,a.name),'ownerId',s.owner_id,'active',auth.service_account_active(r.account_id),
    'enabled',coalesce(p.enabled,false),'instructions',coalesce(p.instructions,''),
    'connectionId',c.id,'connectionLive',c.id IS NOT NULL AND c.deleted_at IS NULL,'provider',c.provider,'baseUrl',c.base_url,
    'sealed',encode(k.sealed,'base64'),'keyVersion',k.key_version,
    'projectName',x.name,'projectKey',x.key)
  FROM app.ai_agent_runs r JOIN auth.principals a ON a.id=r.account_id
  JOIN auth.service_accounts s ON s.principal_id=r.account_id
  JOIN app.projects x ON x.id=r.project_id
  LEFT JOIN app.ai_agent_profiles p ON p.principal_id=r.account_id
  LEFT JOIN app.ai_connections c ON c.id=r.connection_id
  LEFT JOIN app.ai_connection_secrets k ON k.connection_id=c.id AND c.deleted_at IS NULL
  WHERE r.id=run AND r.lease_token=lease AND r.state='running' AND r.lease_until>clock_timestamp()
$$;
REVOKE ALL ON FUNCTION app.ai_run_enqueue(text,text,text,text),app.ai_run_load(uuid,uuid) FROM PUBLIC;
