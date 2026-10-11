-- SPR-14: bounded work aggregate; execution remains in the existing agent/ai modules.
CREATE OR REPLACE FUNCTION auth.permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT ARRAY['tasks.read','tasks.write','work.write','threads.write','releases.manage','maps.read','maps.write',
    'finance.read','finance.write','approvals.decide','agents.manage','members.invite','members.manage',
    'project.settings','project.access',
    'workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings']
$$;
CREATE OR REPLACE FUNCTION auth.project_permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT (auth.permission_catalog())[1:15] $$;
CREATE OR REPLACE FUNCTION auth.workspace_permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT (auth.permission_catalog())[16:20] $$;
CREATE OR REPLACE FUNCTION auth.permission_implies(permission text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT CASE permission
    WHEN 'work.write' THEN ARRAY['tasks.read']
    WHEN 'tasks.write' THEN ARRAY['tasks.read']
    WHEN 'threads.write' THEN ARRAY['tasks.read']
    WHEN 'releases.manage' THEN ARRAY['tasks.write']
    WHEN 'maps.read' THEN ARRAY['tasks.read']
    WHEN 'maps.write' THEN ARRAY['maps.read']
    WHEN 'finance.read' THEN ARRAY['tasks.read']
    WHEN 'finance.write' THEN ARRAY['finance.read']
    WHEN 'approvals.decide' THEN ARRAY['tasks.write']
    WHEN 'agents.manage' THEN ARRAY['tasks.read']
    WHEN 'members.invite' THEN ARRAY['tasks.read']
    WHEN 'members.manage' THEN ARRAY['members.invite']
    WHEN 'project.settings' THEN ARRAY['tasks.read']
    WHEN 'project.access' THEN ARRAY['members.manage','project.settings']
    WHEN 'workspace.people' THEN ARRAY['workspace.invite']
    ELSE ARRAY[]::text[] END
$$;
CREATE OR REPLACE FUNCTION auth.default_preset_permissions(key text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT auth.permission_closure(CASE key
    WHEN 'admin' THEN auth.project_permission_catalog()
    WHEN 'editor' THEN ARRAY['work.write','tasks.write','threads.write','releases.manage','maps.write','finance.read','approvals.decide']
    WHEN 'reader' THEN ARRAY['tasks.read','threads.write','maps.read','finance.read']
    WHEN 'guest' THEN ARRAY['tasks.read','threads.write','maps.read']
    WHEN 'service_read' THEN ARRAY['tasks.read','maps.read']
    WHEN 'service_tasks' THEN ARRAY['work.write','tasks.write','threads.write','maps.read']
    ELSE ARRAY['tasks.read'] END)
$$;
-- Preserve custom presets; approved new permission enters the current editor/service_tasks system presets.
UPDATE app.access_presets SET permissions=auth.permission_closure(permissions||ARRAY['work.write'])
 WHERE archived_at IS NULL AND (key='admin'
   OR (key='editor' AND permissions=auth.permission_closure(ARRAY['tasks.write','threads.write','releases.manage','maps.write','finance.read','approvals.decide']))
   OR (key='service_tasks' AND permissions=auth.permission_closure(ARRAY['tasks.write','threads.write','maps.read'])));
-- Modified system presets retain the user's exact permission choices.
UPDATE app.project_members SET granted=granted;

CREATE TABLE app.task_work_plan (
 project_id text NOT NULL, task_id text NOT NULL, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=160000),
 card text CHECK(length(card)<=100000), bridge_id text NOT NULL,
 holder_id text REFERENCES auth.principals, lease_token uuid, lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,task_id), FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
 CHECK((holder_id IS NULL)=(lease_token IS NULL) AND (holder_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE app.task_work_session (
 project_id text NOT NULL, task_id text NOT NULL, id text NOT NULL,
 agent_id text NOT NULL REFERENCES auth.principals, requested_by text NOT NULL REFERENCES auth.principals,
 mode text NOT NULL CHECK(mode IN ('external','provider_api')),
 state text NOT NULL CHECK(state IN ('awaiting_agent','queued','running','waiting','completed','failed','cancelled','handed_off')),
 goal text NOT NULL CHECK(length(goal) BETWEEN 1 AND 1000), summary text NOT NULL DEFAULT '' CHECK(length(summary)<=4000),
 ai_run_id uuid, thread_id text, relayed_from text,
 skill_snapshot jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(skill_snapshot)='array'),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
 FOREIGN KEY(project_id,ai_run_id) REFERENCES app.ai_agent_runs(project_id,id),
 FOREIGN KEY(project_id,thread_id) REFERENCES app.threads(project_id,id),
 FOREIGN KEY(project_id,relayed_from) REFERENCES app.task_work_session(project_id,id)
);
CREATE UNIQUE INDEX task_work_session_active ON app.task_work_session(project_id,task_id,agent_id,mode)
 WHERE state IN ('awaiting_agent','queued','running','waiting');
CREATE INDEX task_work_session_task ON app.task_work_session(project_id,task_id,started_at DESC,id);
CREATE TABLE app.task_work_request (
 project_id text NOT NULL,task_id text NOT NULL,id text NOT NULL,agent_id text NOT NULL REFERENCES auth.principals,
 author_id text NOT NULL REFERENCES auth.principals,thread_id text NOT NULL,message_id text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','handled','cancelled')),session_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,message_id,agent_id),
 FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
 FOREIGN KEY(project_id,thread_id) REFERENCES app.threads(project_id,id),
 FOREIGN KEY(project_id,message_id) REFERENCES app.messages(project_id,id),
 FOREIGN KEY(project_id,session_id) REFERENCES app.task_work_session(project_id,id)
);
CREATE TABLE app.task_work_event (
 project_id text NOT NULL,task_id text NOT NULL,id text NOT NULL,revision bigint NOT NULL,
 actor_id text NOT NULL REFERENCES auth.principals,kind text NOT NULL,text text NOT NULL CHECK(length(text)<=1000),
 detail text NOT NULL DEFAULT '' CHECK(length(detail)<=4000),session_id text,thread_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
 FOREIGN KEY(project_id,session_id) REFERENCES app.task_work_session(project_id,id),
 FOREIGN KEY(project_id,thread_id) REFERENCES app.threads(project_id,id)
);
CREATE INDEX task_work_event_page ON app.task_work_event(project_id,task_id,created_at DESC,id DESC);
CREATE TABLE app.agent_skill_version (
 project_id text NOT NULL REFERENCES app.projects,id text NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 version text NOT NULL CHECK(length(version) BETWEEN 1 AND 100),content text NOT NULL CHECK(length(content) BETWEEN 1 AND 16000),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),required_tools text[] NOT NULL DEFAULT '{}',
 author_id text NOT NULL REFERENCES auth.principals,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,id),UNIQUE(project_id,name,version),CHECK(cardinality(required_tools)<=20)
);
CREATE TABLE app.agent_work_profile (
 project_id text NOT NULL REFERENCES app.projects,agent_id text NOT NULL REFERENCES auth.principals,
 revision bigint NOT NULL DEFAULT 1,skill_ids text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(project_id,agent_id),CHECK(cardinality(skill_ids)<=20)
);
ALTER TABLE app.task_work_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_work_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY task_work_plan_read ON app.task_work_plan FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY task_work_plan_insert ON app.task_work_plan FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY task_work_plan_update ON app.task_work_plan FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
ALTER TABLE app.task_work_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_work_session FORCE ROW LEVEL SECURITY;
CREATE POLICY task_work_session_read ON app.task_work_session FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY task_work_session_insert ON app.task_work_session FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY task_work_session_update ON app.task_work_session FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
ALTER TABLE app.task_work_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_work_request FORCE ROW LEVEL SECURITY;
CREATE POLICY task_work_request_read ON app.task_work_request FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY task_work_request_insert ON app.task_work_request FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY task_work_request_update ON app.task_work_request FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
ALTER TABLE app.task_work_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_work_event FORCE ROW LEVEL SECURITY;
CREATE POLICY task_work_event_read ON app.task_work_event FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY task_work_event_insert ON app.task_work_event FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY task_work_event_update ON app.task_work_event FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
ALTER TABLE app.agent_skill_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_skill_version FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_skill_version_read ON app.agent_skill_version FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY agent_skill_version_insert ON app.agent_skill_version FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY agent_skill_version_update ON app.agent_skill_version FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
ALTER TABLE app.agent_work_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_work_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_work_profile_read ON app.agent_work_profile FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY agent_work_profile_insert ON app.agent_work_profile FOR INSERT WITH CHECK(auth.can_project(project_id));
CREATE POLICY agent_work_profile_update ON app.agent_work_profile FOR UPDATE USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));

-- A work-owned lifecycle projection observes completed API runs, without changing them or mutating reads.
-- A lifecycle trigger runs inside the existing AI definer functions, without an actor.
-- The runtime is never the table owner. Scope is the linked run project and exists only during a trusted lifecycle function.
CREATE FUNCTION app.work_lifecycle(project text, target regclass) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT app.ai_is_owner(target)
   AND project=current_setting('app.work_lifecycle_project',true)
$$;
REVOKE ALL ON FUNCTION app.work_lifecycle(text,regclass) FROM PUBLIC;
CREATE POLICY work_lifecycle_plan_read ON app.task_work_plan FOR SELECT
 USING(app.work_lifecycle(project_id,'app.task_work_plan'));
CREATE POLICY work_lifecycle_plan_update ON app.task_work_plan FOR UPDATE
 USING(app.work_lifecycle(project_id,'app.task_work_plan')) WITH CHECK(app.work_lifecycle(project_id,'app.task_work_plan'));
CREATE POLICY work_lifecycle_session_read ON app.task_work_session FOR SELECT
 USING(app.work_lifecycle(project_id,'app.task_work_session'));
CREATE POLICY work_lifecycle_session_insert ON app.task_work_session FOR INSERT
 WITH CHECK(app.work_lifecycle(project_id,'app.task_work_session'));
CREATE POLICY work_lifecycle_session_update ON app.task_work_session FOR UPDATE
 USING(app.work_lifecycle(project_id,'app.task_work_session')) WITH CHECK(app.work_lifecycle(project_id,'app.task_work_session'));
CREATE POLICY work_lifecycle_request_read ON app.task_work_request FOR SELECT
 USING(app.work_lifecycle(project_id,'app.task_work_request'));
CREATE POLICY work_lifecycle_request_update ON app.task_work_request FOR UPDATE
 USING(app.work_lifecycle(project_id,'app.task_work_request')) WITH CHECK(app.work_lifecycle(project_id,'app.task_work_request'));
CREATE POLICY work_lifecycle_event_insert ON app.task_work_event FOR INSERT
 WITH CHECK(app.work_lifecycle(project_id,'app.task_work_event'));
CREATE POLICY work_lifecycle_skill_read ON app.agent_skill_version FOR SELECT
 USING(app.work_lifecycle(project_id,'app.agent_skill_version'));
CREATE POLICY work_lifecycle_profile_read ON app.agent_work_profile FOR SELECT
 USING(app.work_lifecycle(project_id,'app.agent_work_profile'));
CREATE POLICY work_lifecycle_project_read ON app.projects FOR SELECT USING(app.work_lifecycle(id,'app.projects'));
CREATE POLICY work_lifecycle_project_update ON app.projects FOR UPDATE
 USING(app.work_lifecycle(id,'app.projects')) WITH CHECK(app.work_lifecycle(id,'app.projects'));
CREATE POLICY work_lifecycle_audit_insert ON app.audit_events FOR INSERT
 WITH CHECK(app.work_lifecycle(project_id,'app.audit_events') AND action IN ('task.work.session.started','task.work.session.finished'));
CREATE POLICY work_lifecycle_outbox_insert ON app.outbox FOR INSERT
 WITH CHECK(app.work_lifecycle(project_id,'app.outbox') AND topic IN ('task.work.session.started','task.work.session.finished'));

CREATE FUNCTION app.finish_task_work_session() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE linked record; event text; previous_scope text := current_setting('app.work_lifecycle_project',true);
BEGIN
 IF NEW.state NOT IN ('completed','failed','cancelled') OR OLD.state=NEW.state THEN RETURN NEW; END IF;
 PERFORM set_config('app.work_lifecycle_project',NEW.project_id,true);
 FOR linked IN UPDATE app.task_work_session SET state=NEW.state,finished_at=NEW.finished_at
   WHERE project_id=NEW.project_id AND ai_run_id=NEW.id AND state IN ('queued','running','waiting')
   RETURNING id,task_id LOOP
   IF NEW.state IN ('completed','cancelled') THEN
     UPDATE app.task_work_request SET state=CASE WHEN NEW.state='completed' THEN 'handled' ELSE 'cancelled' END
       WHERE project_id=NEW.project_id AND session_id=linked.id AND state='pending';
   END IF;
   UPDATE app.task_work_plan SET holder_id=NULL,lease_token=NULL,lease_until=NULL
     WHERE project_id=NEW.project_id AND task_id=linked.task_id AND holder_id=NEW.account_id
       AND NOT EXISTS(SELECT 1 FROM app.task_work_session other WHERE other.project_id=NEW.project_id
         AND other.task_id=linked.task_id AND other.agent_id=NEW.account_id
         AND other.state IN ('awaiting_agent','queued','running','waiting'));
   event := gen_random_uuid()::text;
   INSERT INTO app.task_work_event(project_id,task_id,id,revision,actor_id,kind,text,session_id)
     SELECT NEW.project_id,linked.task_id,event,coalesce((SELECT revision FROM app.task_work_plan
       WHERE project_id=NEW.project_id AND task_id=linked.task_id),0),NEW.account_id,'session.'||NEW.state,
       CASE NEW.state WHEN 'completed' THEN 'Агент завершил работу.' WHEN 'cancelled' THEN 'Работа агента остановлена.'
         ELSE 'Агент завершил работу с ошибкой.' END,linked.id
     ;
   INSERT INTO app.audit_events(id,project_id,actor_id,initiator_id,action,resource_id,revision)
     VALUES(event::uuid,NEW.project_id,NEW.account_id,NEW.requested_by,'task.work.session.finished',linked.id,NEW.revision);
   INSERT INTO app.outbox(id,project_id,topic,payload) VALUES(event::uuid,NEW.project_id,'task.work.session.finished',
     jsonb_build_object('taskId',linked.task_id,'sessionId',linked.id,'state',NEW.state));
 END LOOP;
 PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER ai_work_session_finished AFTER UPDATE OF state ON app.ai_agent_runs
 FOR EACH ROW EXECUTE FUNCTION app.finish_task_work_session();

-- Work-owned participation for all newly queued API runs, including assignment and mention paths.
CREATE FUNCTION app.link_task_work_run() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE event text := gen_random_uuid()::text; previous_scope text := current_setting('app.work_lifecycle_project',true);
BEGIN
 PERFORM set_config('app.work_lifecycle_project',NEW.project_id,true);
 INSERT INTO app.task_work_session(project_id,task_id,id,agent_id,requested_by,mode,state,goal,ai_run_id,thread_id,skill_snapshot)
 SELECT NEW.project_id,NEW.task_id,NEW.id::text,NEW.account_id,NEW.requested_by,'provider_api',NEW.state,
   left(t.title,1000),NEW.id,NEW.thread_id,
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'version',v.version,'digest',v.digest))
     FROM app.agent_work_profile p JOIN app.agent_skill_version v ON v.project_id=p.project_id AND v.id=ANY(p.skill_ids)
     WHERE p.project_id=NEW.project_id AND p.agent_id=NEW.account_id),'[]'::jsonb)
 FROM app.tasks t WHERE t.project_id=NEW.project_id AND t.id=NEW.task_id;
 INSERT INTO app.task_work_event(project_id,task_id,id,revision,actor_id,kind,text,session_id,thread_id)
 VALUES(NEW.project_id,NEW.task_id,event,
   coalesce((SELECT revision FROM app.task_work_plan WHERE project_id=NEW.project_id AND task_id=NEW.task_id),0),
   NEW.requested_by,'session.started','Агенту поручена работа по задаче.',NEW.id::text,NEW.thread_id);
 INSERT INTO app.audit_events(id,project_id,actor_id,initiator_id,action,resource_id,revision)
   VALUES(event::uuid,NEW.project_id,NEW.requested_by,NEW.requested_by,'task.work.session.started',NEW.id::text,NEW.revision);
 INSERT INTO app.outbox(id,project_id,topic,payload) VALUES(event::uuid,NEW.project_id,'task.work.session.started',
   jsonb_build_object('taskId',NEW.task_id,'sessionId',NEW.id::text));
 PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER ai_work_session_started AFTER INSERT ON app.ai_agent_runs
 FOR EACH ROW EXECUTE FUNCTION app.link_task_work_run();

-- Keep lifecycle locking in the same project-before-run order as human work commands.
CREATE OR REPLACE FUNCTION app.ai_run_finish(run uuid, lease uuid, final_state text, code text, message text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE credential text; found_run uuid; target_project text; previous_scope text := current_setting('app.work_lifecycle_project',true);
BEGIN
  IF final_state NOT IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'invalid state' USING ERRCODE='22023'; END IF;
  SELECT project_id INTO target_project FROM app.ai_agent_runs WHERE id=run;
  PERFORM set_config('app.work_lifecycle_project',coalesce(target_project,''),true);
  PERFORM 1 FROM app.projects WHERE id=target_project FOR UPDATE;
  UPDATE app.ai_agent_runs r SET state=final_state,error_code=code,message_id=message,finished_at=clock_timestamp(),
    lease_token=NULL,lease_until=NULL,transcript=NULL,revision=r.revision+1
  WHERE r.id=run AND r.lease_token=lease AND r.state='running'
  RETURNING r.id,r.credential_id INTO found_run,credential;
  IF found_run IS NULL THEN
    PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
    RETURN false;
  END IF;
  UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=credential AND revoked_at IS NULL;
  PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION app.ai_run_claim(lease_seconds integer)
RETURNS TABLE(run_project text, run_id uuid, run_lease uuid, run_account text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected app.ai_agent_runs; target_project text; previous_scope text := current_setting('app.work_lifecycle_project',true);
BEGIN
  -- Project-before-run order matches human cancellation and plan commands.
  FOR target_project IN SELECT DISTINCT project_id FROM app.ai_agent_runs
    WHERE (state='running' AND lease_until<clock_timestamp() AND attempts>=3)
       OR (state='queued' AND created_at<clock_timestamp()-interval '1 hour') ORDER BY project_id LOOP
    PERFORM set_config('app.work_lifecycle_project',target_project,true);
    PERFORM 1 FROM app.projects WHERE id=target_project FOR UPDATE;
  END LOOP;
  PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
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

-- Existing API runs become the same sessions. Historical skills are not inferred retroactively.
DO $$
DECLARE target_project text; previous_scope text := current_setting('app.work_lifecycle_project',true);
BEGIN
 FOR target_project IN SELECT DISTINCT project_id FROM app.ai_agent_runs ORDER BY project_id LOOP
   PERFORM set_config('app.work_lifecycle_project',target_project,true);
   INSERT INTO app.task_work_session(project_id,task_id,id,agent_id,requested_by,mode,state,goal,
     ai_run_id,thread_id,started_at,finished_at)
   SELECT project_id,task_id,id::text,account_id,requested_by,'provider_api',state,
     'Работа API агента по задаче.',id,thread_id,coalesce(started_at,created_at),finished_at
   FROM app.ai_agent_runs WHERE project_id=target_project
   ON CONFLICT(project_id,id) DO NOTHING;
 END LOOP;
 PERFORM set_config('app.work_lifecycle_project',coalesce(previous_scope,''),true);
END $$;
