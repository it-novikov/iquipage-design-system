-- Meaningful task events (docs/adr W3): what changed on a task, by whom, in commit order per project.
-- The audit trail records only "task.updated"; this log names the change (status, owner, dates, dependency,
-- discussion, request) with codes, dates and person ids only, never titles or text.
ALTER TABLE app.projects ADD COLUMN activity_sequence bigint NOT NULL DEFAULT 0;
CREATE TABLE app.task_activity (
  project_id text NOT NULL REFERENCES app.projects,
  sequence bigint NOT NULL,
  task_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('status','completed','reopened','owner','due','planned','dependency','thread','resolution','request')),
  actor_id text NOT NULL REFERENCES auth.principals,
  initiator_id text REFERENCES auth.principals,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,sequence),
  FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id)
);
CREATE INDEX task_activity_task ON app.task_activity(project_id,task_id,sequence DESC);
-- "Жду" reads the latest assignment of a task: only its owner events, however long the rest of its history is.
CREATE INDEX task_activity_owner ON app.task_activity(project_id,task_id,sequence DESC) WHERE kind='owner';
ALTER TABLE app.task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON app.task_activity USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));

-- The position is allocated under the project row lock, so position order is commit order (as outbox positions).
-- Without a request actor (a migration, a maintenance script) nothing is recorded: there is nobody to attribute.
CREATE FUNCTION app.append_task_activity(target_project text,target_task text,activity text,change jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE next_position bigint;
BEGIN
  IF auth.actor_id() IS NULL THEN RETURN; END IF;
  UPDATE app.projects SET activity_sequence=activity_sequence+1 WHERE id=target_project RETURNING activity_sequence INTO next_position;
  INSERT INTO app.task_activity(project_id,sequence,task_id,kind,actor_id,initiator_id,detail)
  VALUES(target_project,next_position,target_task,activity,auth.actor_id(),nullif(current_setting('app.initiator_id',true),''),change);
END $$;

CREATE FUNCTION app.record_task_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.owner_id IS NOT NULL THEN
      PERFORM app.append_task_activity(NEW.project_id,NEW.id,'owner',jsonb_build_object('from',null,'to',NEW.owner_id));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.id,
      CASE WHEN NEW.status='ready_for_release' THEN 'completed' WHEN OLD.status='ready_for_release' THEN 'reopened' ELSE 'status' END,
      jsonb_build_object('from',OLD.status,'to',NEW.status));
  END IF;
  IF NEW.result IS DISTINCT FROM OLD.result AND NEW.result='accepted' THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.id,'completed',jsonb_build_object('result','accepted'));
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.id,'owner',jsonb_build_object('from',OLD.owner_id,'to',NEW.owner_id));
  END IF;
  IF NEW.due IS DISTINCT FROM OLD.due THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.id,'due',jsonb_build_object('from',OLD.due,'to',NEW.due));
  END IF;
  IF NEW.planned_start IS DISTINCT FROM OLD.planned_start OR NEW.planned_end IS DISTINCT FROM OLD.planned_end THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.id,'planned',jsonb_build_object(
      'from',jsonb_build_array(OLD.planned_start,OLD.planned_end),'to',jsonb_build_array(NEW.planned_start,NEW.planned_end)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_task_activity AFTER INSERT OR UPDATE ON app.tasks FOR EACH ROW EXECUTE FUNCTION app.record_task_activity();

-- A blocking dependency is news for both ends: the waiting task and the task that blocks it.
CREATE FUNCTION app.record_dependency_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE change text;
BEGIN
  IF NEW.kind<>'depends' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN change:=CASE WHEN NEW.archived_at IS NULL THEN 'added' END;
  ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN change:='removed';
  ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN change:='added';
  END IF;
  IF change IS NULL THEN RETURN NEW; END IF;
  PERFORM app.append_task_activity(NEW.project_id,NEW.from_id,'dependency',jsonb_build_object('change',change,'role','blocked_by','other',NEW.to_id));
  PERFORM app.append_task_activity(NEW.project_id,NEW.to_id,'dependency',jsonb_build_object('change',change,'role','blocks','other',NEW.from_id));
  RETURN NEW;
END $$;
CREATE TRIGGER record_dependency_activity AFTER INSERT OR UPDATE ON app.task_links FOR EACH ROW EXECUTE FUNCTION app.record_dependency_activity();

CREATE FUNCTION app.record_message_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  SELECT task_id INTO target FROM app.threads WHERE project_id=NEW.project_id AND id=NEW.thread_id;
  PERFORM app.append_task_activity(NEW.project_id,target,'thread',jsonb_build_object('threadId',NEW.thread_id));
  RETURN NEW;
END $$;
CREATE TRIGGER record_message_activity AFTER INSERT ON app.messages FOR EACH ROW EXECUTE FUNCTION app.record_message_activity();

CREATE FUNCTION app.record_resolution_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resolved IS DISTINCT FROM OLD.resolved THEN
    PERFORM app.append_task_activity(NEW.project_id,NEW.task_id,'resolution',jsonb_build_object('threadId',NEW.id,'resolved',NEW.resolved));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_resolution_activity AFTER UPDATE ON app.threads FOR EACH ROW EXECUTE FUNCTION app.record_resolution_activity();

CREATE FUNCTION app.record_request_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.recipient_id IS NOT DISTINCT FROM OLD.recipient_id THEN
    RETURN NEW;
  END IF;
  PERFORM app.append_task_activity(NEW.project_id,NEW.task_id,'request',jsonb_build_object(
    'requestId',NEW.id,'kind',NEW.kind,'status',NEW.status,'recipientId',NEW.recipient_id,'requestedBy',NEW.requested_by,
    'change',CASE WHEN TG_OP='INSERT' THEN 'created' WHEN NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN 'reassigned' ELSE NEW.status END));
  RETURN NEW;
END $$;
CREATE TRIGGER record_request_activity AFTER INSERT OR UPDATE ON app.attention_requests FOR EACH ROW EXECUTE FUNCTION app.record_request_activity();
