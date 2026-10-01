-- Raising notifications in the transaction of their cause (docs/decisions/0006-notifications-telegram.md).
-- Assignments and requests come from the meaningful task events (app.task_activity, docs/adr W3), so the board,
-- planning, the Workbench and agents raise them alike; mentions come from the discussion command, which reads names.

-- Whether a person may receive a notification about a project now: an enabled person (never a service account or an
-- agent) who is a member with the right to read its tasks. Memberships carry no row security.
CREATE FUNCTION app.notification_recipient(target_project text,person text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM auth.principals p JOIN app.project_members m ON m.principal_id=p.id
    WHERE p.id=person AND p.kind='human' AND p.disabled_at IS NULL AND m.project_id=target_project
      AND 'tasks.read'=ANY(m.permissions))
$$;

-- The one way a notification is written. Nobody is told about their own action, a repeated cause adds nothing, and a
-- Telegram delivery is queued when the person linked a chat, did not mute the kind and the project allows it.
CREATE FUNCTION app.raise_notification(person text,target_project text,target_task text,notification_kind text,
    actor text,change jsonb,key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE raised uuid;
BEGIN
  IF person IS NULL OR person IS NOT DISTINCT FROM actor OR NOT app.notification_recipient(target_project,person) THEN
    RETURN NULL;
  END IF;
  INSERT INTO app.notifications(recipient_id,project_id,task_id,kind,actor_id,detail,dedupe_key)
  VALUES(person,target_project,target_task,notification_kind,actor,coalesce(change,'{}'::jsonb),key)
  ON CONFLICT (recipient_id,dedupe_key) DO NOTHING RETURNING id INTO raised;
  IF raised IS NULL THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM app.telegram_connections c WHERE c.principal_id=person)
     AND NOT EXISTS(SELECT 1 FROM app.notification_preferences n WHERE n.principal_id=person AND notification_kind=ANY(n.telegram_muted))
     AND coalesce((SELECT s.enabled FROM app.telegram_project_settings s WHERE s.project_id=target_project),true) THEN
    INSERT INTO app.telegram_deliveries(notification_id,recipient_id,project_id) VALUES(raised,person,target_project);
  END IF;
  RETURN raised;
END $$;
REVOKE ALL ON FUNCTION app.notification_recipient(text,text),app.raise_notification(text,text,text,text,text,jsonb,text) FROM PUBLIC;

-- Assignment and requests, from the task's meaningful events. An agent acting for a person (the initiator) does not
-- notify that person about their own work either.
CREATE FUNCTION app.notify_from_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE person text;
BEGIN
  IF NEW.kind='owner' THEN
    person:=NEW.detail->>'to';
    IF person IS NOT NULL AND person IS DISTINCT FROM NEW.initiator_id THEN
      PERFORM app.raise_notification(person,NEW.project_id,NEW.task_id,'assigned',NEW.actor_id,'{}'::jsonb,
        'assigned:'||NEW.project_id||':'||NEW.sequence);
    END IF;
  ELSIF NEW.kind='request' AND NEW.detail->>'change' IN ('created','reassigned') THEN
    person:=NEW.detail->>'recipientId';
    IF person IS DISTINCT FROM NEW.actor_id AND person IS DISTINCT FROM NEW.initiator_id THEN
      -- "… просит": the person who asked (never the recipient), also when someone else passed the request on.
      PERFORM app.raise_notification(person,NEW.project_id,NEW.task_id,'request',NEW.detail->>'requestedBy',
        jsonb_build_object('requestId',NEW.detail->>'requestId','requestKind',NEW.detail->>'kind'),
        'request:'||NEW.project_id||':'||(NEW.detail->>'requestId')||':'||NEW.sequence);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.notify_from_activity() FROM PUBLIC;
CREATE TRIGGER notify_from_activity AFTER INSERT ON app.task_activity FOR EACH ROW EXECUTE FUNCTION app.notify_from_activity();

-- A mention, raised by the discussion command for each person it found named in the message it just wrote. Only the
-- author of that message, in that project, can raise it, and only for a person who may read the task.
CREATE FUNCTION app.notify_mention(target_project text,message text,person text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source record;
BEGIN
  IF auth.actor_id() IS NULL OR NOT auth.can_project(target_project) THEN RETURN false; END IF;
  -- Read under the caller's own row security: the message must be visible to them and written by them.
  SELECT m.id,t.task_id,m.thread_id INTO source FROM app.messages m JOIN app.threads t ON t.project_id=m.project_id AND t.id=m.thread_id
  WHERE m.project_id=target_project AND m.id=message AND m.author_id=auth.actor_id();
  IF source.id IS NULL THEN RETURN false; END IF;
  RETURN app.raise_notification(person,target_project,source.task_id,'mention',auth.actor_id(),
    jsonb_build_object('threadId',source.thread_id,'messageId',source.id),
    'mention:'||target_project||':'||source.id) IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION app.notify_mention(text,text,text) FROM PUBLIC;
