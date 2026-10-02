-- Runs of service-account agents (docs/decisions/0005-ai-agents.md). A run is one task worked on by one agent: queued
-- when the task is assigned to the account or a person starts it by hand, then taken by a runner of the API process
-- under a lease, step by step (a model call or a tool call), until a final comment, a failure, a stop or a limit.
-- The agent acts as its service account through a credential of its own kind, `runtime`: issued for one run and one
-- project, never shown to anybody (only its hash exists, of a secret nobody keeps) and revoked when the run ends.

DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='auth.credentials'::regclass AND contype='c' AND conname='credential_kind';
  EXECUTE format('ALTER TABLE auth.credentials DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE auth.credentials ADD CONSTRAINT credential_kind CHECK(kind IN ('session','agent','service','oauth','runtime'));
ALTER TABLE auth.credentials ADD CONSTRAINT credential_runtime CHECK(kind<>'runtime' OR (
  project_id IS NOT NULL AND csrf IS NULL AND audience IS NULL AND name IS NULL AND grant_id IS NULL
  AND initiator_id<>principal_id AND cardinality(capabilities)=0));

DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='app.audit_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%credential_kind%';
  EXECUTE format('ALTER TABLE app.audit_events DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.audit_events ADD CONSTRAINT audit_credential_kind
  CHECK(credential_kind IS NULL OR credential_kind IN ('session','agent','service','oauth','runtime'));

CREATE TABLE app.ai_agent_runs (
  project_id text NOT NULL REFERENCES app.projects,
  id uuid NOT NULL UNIQUE,
  task_id text NOT NULL,
  account_id text NOT NULL REFERENCES auth.principals,
  connection_id uuid REFERENCES app.ai_connections,
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  trigger text NOT NULL CHECK(trigger IN ('assigned','manual')),
  requested_by text NOT NULL REFERENCES auth.principals,
  state text NOT NULL CHECK(state IN ('queued','running','completed','failed','cancelled')),
  max_steps integer NOT NULL CHECK(max_steps BETWEEN 1 AND 50),
  max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 256 AND 32000),
  steps_used integer NOT NULL DEFAULT 0 CHECK(steps_used BETWEEN 0 AND 50),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
  -- What the provider said the run cost, in millionths of a US dollar, when it says so (OpenRouter does).
  cost_micros bigint CHECK(cost_micros IS NULL OR cost_micros>=0),
  error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]{2,40}$'),
  credential_id text REFERENCES auth.credentials,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  -- The conversation so far, so a run taken over after a crash continues where it stopped; dropped when it ends.
  transcript jsonb CHECK(transcript IS NULL OR octet_length(transcript::text)<=1048576),
  message_id text,
  cancel_requested_by text REFERENCES auth.principals,
  cancel_requested_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  deadline_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY(project_id,id),
  FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
  CHECK((state IN ('completed','failed','cancelled'))=(finished_at IS NOT NULL)),
  CHECK((cancel_requested_at IS NULL)=(cancel_requested_by IS NULL))
);
-- One active run of an account on a task: a second assignment or a second click joins the first.
CREATE UNIQUE INDEX ai_agent_runs_active ON app.ai_agent_runs(project_id,task_id,account_id) WHERE state IN ('queued','running');
CREATE INDEX ai_agent_runs_due ON app.ai_agent_runs(created_at,id) WHERE state IN ('queued','running');
CREATE INDEX ai_agent_runs_task ON app.ai_agent_runs(project_id,task_id,created_at DESC);
CREATE INDEX ai_agent_runs_account ON app.ai_agent_runs(account_id,created_at DESC);

-- What happened in a run: each model call (tokens, cost) and each tool call (its name, a short summary of its
-- arguments and how it ended). Append-only.
CREATE TABLE app.ai_agent_run_steps (
  project_id text NOT NULL,
  run_id uuid NOT NULL,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 1000),
  kind text NOT NULL CHECK(kind IN ('model','tool')),
  tool text CHECK(tool IS NULL OR tool ~ '^[a-z_]{1,64}$'),
  summary text NOT NULL DEFAULT '' CHECK(length(summary)<=500),
  status text NOT NULL CHECK(status IN ('ok','error','denied')),
  error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]{2,40}$'),
  input_tokens integer CHECK(input_tokens IS NULL OR input_tokens>=0),
  output_tokens integer CHECK(output_tokens IS NULL OR output_tokens>=0),
  cost_micros bigint CHECK(cost_micros IS NULL OR cost_micros>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,run_id,sequence),
  FOREIGN KEY(project_id,run_id) REFERENCES app.ai_agent_runs(project_id,id),
  CHECK((kind='tool')=(tool IS NOT NULL))
);

ALTER TABLE app.ai_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_agent_runs FORCE ROW LEVEL SECURITY;
-- People of the project see runs and ask to stop one; only the queue functions below create and advance them.
CREATE POLICY ai_agent_runs_read ON app.ai_agent_runs FOR SELECT
  USING(auth.can_project(project_id) OR app.ai_is_owner('app.ai_agent_runs'));
CREATE POLICY ai_agent_runs_insert ON app.ai_agent_runs FOR INSERT WITH CHECK(app.ai_is_owner('app.ai_agent_runs'));
CREATE POLICY ai_agent_runs_update ON app.ai_agent_runs FOR UPDATE
  USING(auth.can_project(project_id) OR app.ai_is_owner('app.ai_agent_runs'))
  WITH CHECK(auth.can_project(project_id) OR app.ai_is_owner('app.ai_agent_runs'));
ALTER TABLE app.ai_agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_agent_run_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_agent_run_steps_read ON app.ai_agent_run_steps FOR SELECT
  USING(auth.can_project(project_id) OR app.ai_is_owner('app.ai_agent_run_steps'));
CREATE POLICY ai_agent_run_steps_insert ON app.ai_agent_run_steps FOR INSERT
  WITH CHECK(app.ai_is_owner('app.ai_agent_run_steps'));

-- Queues a run of the account's agent on a task, for the caller, who must see the project. Nothing when the account
-- has no enabled agent there (or, for an assignment, one that does not start on assignment); the active run when
-- there is one; a failed run with RUN_LIMIT when the account used its runs of the last hour.
CREATE FUNCTION app.ai_run_enqueue(target_project text, target_task text, account text, run_trigger text)
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
    max_output_tokens,error_code,finished_at)
  VALUES(target_project,created,target_task,account,profile.connection_id,profile.model,run_trigger,requester,
    CASE WHEN recent>=profile.runs_per_hour THEN 'failed' ELSE 'queued' END,profile.max_steps,profile.max_output_tokens,
    CASE WHEN recent>=profile.runs_per_hour THEN 'RUN_LIMIT' END,
    CASE WHEN recent>=profile.runs_per_hour THEN clock_timestamp() END);
  RETURN QUERY SELECT r.id, r.state, r.error_code FROM app.ai_agent_runs r WHERE r.project_id=target_project AND r.id=created;
END $$;

-- A task assigned to a service account with an agent starts it. Changes made by an agent run never start another
-- run (no loops between agents), and an account taking a task itself starts nothing.
CREATE FUNCTION app.ai_run_on_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id IS NULL OR NEW.result<>'open' OR auth.actor_id() IS NULL OR auth.actor_id()=NEW.owner_id
     OR coalesce(current_setting('app.agent_run',true),'')<>'' THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=NEW.owner_id AND p.kind='service') THEN
    PERFORM app.ai_run_enqueue(NEW.project_id,NEW.id,NEW.owner_id,'assigned');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_run_on_assignment AFTER INSERT OR UPDATE OF owner_id ON app.tasks
  FOR EACH ROW EXECUTE FUNCTION app.ai_run_on_assignment();

-- The runner takes the oldest due run under a lease: a queued one, or a running one whose runner stopped answering
-- (after three takeovers it is abandoned; a run queued for an hour expires). Returns the account the run acts as.
CREATE FUNCTION app.ai_run_claim(lease_seconds integer)
RETURNS TABLE(run_project text, run_id uuid, run_lease uuid, run_account text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected app.ai_agent_runs;
BEGIN
  UPDATE app.ai_agent_runs r SET state='failed',error_code='RUN_ABANDONED',finished_at=clock_timestamp(),lease_token=NULL,
    lease_until=NULL,transcript=NULL,revision=r.revision+1
  WHERE r.state='running' AND r.lease_until<clock_timestamp() AND r.attempts>=3;
  -- A run that waited an hour (no runner: the feature was off, or none in any process) is not started late.
  UPDATE app.ai_agent_runs r SET state='failed',error_code='RUN_EXPIRED',finished_at=clock_timestamp(),revision=r.revision+1
  WHERE r.state='queued' AND r.created_at<clock_timestamp()-interval '1 hour';
  SELECT r.* INTO selected FROM app.ai_agent_runs r
  WHERE r.state='queued' OR (r.state='running' AND r.lease_until<clock_timestamp())
  ORDER BY r.created_at,r.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF selected.id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE app.ai_agent_runs r SET state='running',attempts=r.attempts+1,lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+make_interval(secs=>least(greatest(lease_seconds,30),900)),
    started_at=coalesce(r.started_at,clock_timestamp()),
    deadline_at=coalesce(r.deadline_at,clock_timestamp()+interval '20 minutes'),revision=r.revision+1
  WHERE r.project_id=selected.project_id AND r.id=selected.id
  RETURNING r.project_id,r.id,r.lease_token,r.account_id;
END $$;

-- Everything the runner needs about a leased run: the run, the account, its agent now, the connection and its sealed
-- key. Called with the account as the actor, so the project shows only while the account can still see it.
CREATE FUNCTION app.ai_run_load(run uuid, lease uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object(
    'projectId',r.project_id,'id',r.id,'taskId',r.task_id,'accountId',r.account_id,'trigger',r.trigger,
    'requestedBy',r.requested_by,'model',r.model,'maxSteps',r.max_steps,'maxOutputTokens',r.max_output_tokens,
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

-- Binds the run's runtime credential, issued for this account, its owner and this project.
CREATE FUNCTION app.ai_run_attach(run uuid, lease uuid, credential text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE updated integer;
BEGIN
  UPDATE app.ai_agent_runs r SET credential_id=credential,revision=r.revision+1
  WHERE r.id=run AND r.lease_token=lease AND r.state='running' AND EXISTS(
    SELECT 1 FROM auth.credentials c JOIN auth.service_accounts s ON s.principal_id=c.principal_id
    WHERE c.id=credential AND c.kind='runtime' AND c.principal_id=r.account_id AND c.project_id=r.project_id
      AND c.initiator_id=s.owner_id AND c.revoked_at IS NULL);
  GET DIAGNOSTICS updated=ROW_COUNT;RETURN updated=1;
END $$;

-- Records a step of a leased run and adds its tokens and cost; the number of the step, or null when the lease is lost.
CREATE FUNCTION app.ai_run_step(run uuid, lease uuid, step_kind text, step_tool text, step_summary text, step_status text,
  step_error text, step_input integer, step_output integer, step_cost bigint) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target app.ai_agent_runs; next_sequence integer;
BEGIN
  SELECT r.* INTO target FROM app.ai_agent_runs r WHERE r.id=run AND r.lease_token=lease AND r.state='running' FOR UPDATE;
  IF target.id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(max(s.sequence),0)+1 INTO next_sequence FROM app.ai_agent_run_steps s
  WHERE s.project_id=target.project_id AND s.run_id=target.id;
  INSERT INTO app.ai_agent_run_steps(project_id,run_id,sequence,kind,tool,summary,status,error_code,input_tokens,
    output_tokens,cost_micros)
  VALUES(target.project_id,target.id,next_sequence,step_kind,step_tool,left(coalesce(step_summary,''),500),step_status,
    step_error,step_input,step_output,step_cost);
  UPDATE app.ai_agent_runs r SET steps_used=least(r.steps_used+CASE WHEN step_kind='model' THEN 1 ELSE 0 END,50),
    input_tokens=r.input_tokens+coalesce(step_input,0),output_tokens=r.output_tokens+coalesce(step_output,0),
    cost_micros=CASE WHEN step_cost IS NULL THEN r.cost_micros ELSE coalesce(r.cost_micros,0)+step_cost END,
    revision=r.revision+1
  WHERE r.project_id=target.project_id AND r.id=target.id;
  RETURN next_sequence;
END $$;

-- Keeps the lease, saves the conversation and says whether to go on: ok, cancelled (a person asked to stop),
-- disabled (the agent, its connection or its account stopped), timeout, or lost (the lease went to another runner).
CREATE FUNCTION app.ai_run_heartbeat(run uuid, lease uuid, lease_seconds integer, conversation jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target app.ai_agent_runs;
BEGIN
  UPDATE app.ai_agent_runs r SET lease_until=clock_timestamp()+make_interval(secs=>least(greatest(lease_seconds,30),900)),
    transcript=coalesce(conversation,r.transcript)
  WHERE r.id=run AND r.lease_token=lease AND r.state='running' AND r.lease_until>clock_timestamp()
  RETURNING r.* INTO target;
  IF target.id IS NULL THEN RETURN 'lost'; END IF;
  IF target.cancel_requested_at IS NOT NULL THEN RETURN 'cancelled'; END IF;
  IF NOT auth.service_account_active(target.account_id) OR NOT EXISTS(
      SELECT 1 FROM app.ai_agent_profiles p JOIN app.ai_connections c ON c.id=target.connection_id AND c.deleted_at IS NULL
      WHERE p.principal_id=target.account_id AND p.enabled) THEN
    RETURN 'disabled';
  END IF;
  IF target.deadline_at<clock_timestamp() THEN RETURN 'timeout'; END IF;
  RETURN 'ok';
END $$;

-- Ends a leased run, drops its conversation and revokes its credential.
CREATE FUNCTION app.ai_run_finish(run uuid, lease uuid, final_state text, code text, message text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE credential text; found_run uuid;
BEGIN
  IF final_state NOT IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'invalid state' USING ERRCODE='22023'; END IF;
  UPDATE app.ai_agent_runs r SET state=final_state,error_code=code,message_id=message,finished_at=clock_timestamp(),
    lease_token=NULL,lease_until=NULL,transcript=NULL,revision=r.revision+1
  WHERE r.id=run AND r.lease_token=lease AND r.state='running'
  RETURNING r.id,r.credential_id INTO found_run,credential;
  IF found_run IS NULL THEN RETURN false; END IF;
  UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=credential AND revoked_at IS NULL;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.ai_run_enqueue(text,text,text,text),app.ai_run_claim(integer),app.ai_run_load(uuid,uuid),
  app.ai_run_attach(uuid,uuid,text),app.ai_run_step(uuid,uuid,text,text,text,text,text,integer,integer,bigint),
  app.ai_run_heartbeat(uuid,uuid,integer,jsonb),app.ai_run_finish(uuid,uuid,text,text,text) FROM PUBLIC;
