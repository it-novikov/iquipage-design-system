-- A mention in a task discussion starts the agent of the service account it names (docs/decisions/0005-ai-agents.md),
-- now that discussions know mentions (V20261001000043). The discussion command finds the names, as for a person's
-- mention; this function checks the message, its author and the agent, and queues a run that answers in the thread
-- of the message. The agent's own messages never start a run (no loops between agents).
ALTER TABLE app.ai_agent_profiles ADD COLUMN on_mention boolean NOT NULL DEFAULT true;
ALTER TABLE app.ai_agent_runs ADD COLUMN thread_id text, ADD COLUMN source_message_id text;

DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='app.ai_agent_runs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''assigned''%''manual''%';
  EXECUTE format('ALTER TABLE app.ai_agent_runs DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.ai_agent_runs ADD CONSTRAINT ai_agent_runs_trigger CHECK(trigger IN ('assigned','manual','mention'));
ALTER TABLE app.ai_agent_runs ADD CONSTRAINT ai_agent_runs_mention
  CHECK((trigger='mention')=(thread_id IS NOT NULL AND source_message_id IS NOT NULL));

-- The decision of V20261001000048's ai_run_enqueue, with the thread and message a mention came from. Called only by
-- the SECURITY DEFINER functions below.
CREATE FUNCTION app.ai_run_queue(target_project text, target_task text, account text, run_trigger text,
  source_thread text, source_message text)
RETURNS TABLE(run_id uuid, run_state text, run_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE profile app.ai_agent_profiles; existing app.ai_agent_runs; recent integer; requester text := auth.actor_id();
  created uuid := gen_random_uuid();
BEGIN
  IF requester IS NULL OR run_trigger NOT IN ('assigned','manual','mention') OR NOT auth.can_project(target_project) THEN
    RETURN;
  END IF;
  SELECT p.* INTO profile FROM app.ai_agent_profiles p
    JOIN app.ai_connections c ON c.id=p.connection_id AND c.deleted_at IS NULL
    JOIN app.project_members m ON m.project_id=target_project AND m.principal_id=p.principal_id
    JOIN app.projects x ON x.id=target_project AND x.workspace_id=p.workspace_id
  WHERE p.principal_id=account AND p.enabled AND auth.service_account_active(account);
  IF profile.principal_id IS NULL OR (run_trigger='assigned' AND NOT profile.on_assignment)
     OR (run_trigger='mention' AND NOT profile.on_mention) THEN
    RETURN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app.tasks t WHERE t.project_id=target_project AND t.id=target_task AND t.result='open') THEN
    RETURN;
  END IF;
  -- One decision per account at a time: two triggers racing cannot both take the last run of the hour.
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
    max_output_tokens,max_run_tokens,thread_id,source_message_id,error_code,finished_at)
  VALUES(target_project,created,target_task,account,profile.connection_id,profile.model,run_trigger,requester,
    CASE WHEN recent>=profile.runs_per_hour THEN 'failed' ELSE 'queued' END,profile.max_steps,profile.max_output_tokens,
    profile.max_run_tokens,
    CASE WHEN run_trigger='mention' THEN source_thread END,CASE WHEN run_trigger='mention' THEN source_message END,
    CASE WHEN recent>=profile.runs_per_hour THEN 'RUN_LIMIT' END,
    CASE WHEN recent>=profile.runs_per_hour THEN clock_timestamp() END);
  RETURN QUERY SELECT r.id, r.state, r.error_code FROM app.ai_agent_runs r WHERE r.project_id=target_project AND r.id=created;
END $$;

-- An assignment or a click: as before, without a source message.
CREATE OR REPLACE FUNCTION app.ai_run_enqueue(target_project text, target_task text, account text, run_trigger text)
RETURNS TABLE(run_id uuid, run_state text, run_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF run_trigger NOT IN ('assigned','manual') THEN RETURN; END IF;
  RETURN QUERY SELECT q.run_id, q.run_state, q.run_error FROM app.ai_run_queue(target_project,target_task,account,run_trigger,NULL,NULL) q;
END $$;

-- A mention of the account in a message the caller just wrote. Like app.notify_mention: only the author of that message,
-- under their own row security, and never from inside an agent run.
CREATE FUNCTION app.ai_run_mention(target_project text, message text, account text)
RETURNS TABLE(run_id uuid, run_state text, run_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source record;
BEGIN
  IF auth.actor_id() IS NULL OR auth.actor_id()=account OR coalesce(current_setting('app.agent_run',true),'')<>''
     OR NOT auth.can_project(target_project) THEN
    RETURN;
  END IF;
  SELECT m.id,t.task_id,m.thread_id INTO source FROM app.messages m JOIN app.threads t ON t.project_id=m.project_id AND t.id=m.thread_id
  WHERE m.project_id=target_project AND m.id=message AND m.author_id=auth.actor_id();
  IF source.id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=account AND p.kind='service') THEN RETURN; END IF;
  RETURN QUERY SELECT q.run_id, q.run_state, q.run_error
    FROM app.ai_run_queue(target_project,source.task_id,account,'mention',source.thread_id,source.id) q;
END $$;

-- As in V20261001000048, with the thread and the message of a mention.
CREATE OR REPLACE FUNCTION app.ai_run_load(run uuid, lease uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object(
    'projectId',r.project_id,'id',r.id,'taskId',r.task_id,'accountId',r.account_id,'trigger',r.trigger,
    'requestedBy',r.requested_by,'model',r.model,'maxSteps',r.max_steps,'maxOutputTokens',r.max_output_tokens,
    'maxRunTokens',r.max_run_tokens,'tokensUsed',r.input_tokens+r.output_tokens,
    'threadId',r.thread_id,'sourceMessageId',r.source_message_id,
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
REVOKE ALL ON FUNCTION app.ai_run_queue(text,text,text,text,text,text),app.ai_run_mention(text,text,text),
  app.ai_run_enqueue(text,text,text,text),app.ai_run_load(uuid,uuid) FROM PUBLIC;
