-- Queueing a notification for the person's external channels (docs/decisions/0007-notification-channels.md). Raising
-- stays as it was in V…043; only its Telegram block moves into a trigger on app.notifications, so every way a
-- notification is written queues it alike and the raise function no longer knows about channels.
CREATE OR REPLACE FUNCTION app.raise_notification(person text,target_project text,target_task text,notification_kind text,
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
  RETURN raised;
END $$;

-- A new notification is queued for each channel the person has on, unless they muted its kind or the project switched
-- external notifications off. Only enabled people: never a service account or an agent, whatever rows they have.
-- The worker checks all of it again when the batch leaves.
CREATE FUNCTION app.queue_notification_deliveries() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE choice app.notification_preferences;person auth.principals;
BEGIN
  SELECT * INTO person FROM auth.principals p WHERE p.id=NEW.recipient_id;
  IF person.kind IS DISTINCT FROM 'human' OR person.disabled_at IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO choice FROM app.notification_preferences n WHERE n.principal_id=NEW.recipient_id;
  IF NEW.kind=ANY(coalesce(choice.muted_kinds,'{}'))
     OR NOT coalesce((SELECT s.enabled FROM app.project_notification_settings s WHERE s.project_id=NEW.project_id),true) THEN
    RETURN NULL;
  END IF;
  IF coalesce(choice.telegram_enabled,true) AND EXISTS(SELECT 1 FROM app.telegram_connections c WHERE c.principal_id=NEW.recipient_id) THEN
    INSERT INTO app.notification_deliveries(notification_id,channel,recipient_id,project_id,created_at)
    VALUES(NEW.id,'telegram',NEW.recipient_id,NEW.project_id,NEW.created_at);
  END IF;
  IF coalesce(choice.email_enabled,false) AND person.email IS NOT NULL THEN
    INSERT INTO app.notification_deliveries(notification_id,channel,recipient_id,project_id,created_at)
    VALUES(NEW.id,'email',NEW.recipient_id,NEW.project_id,NEW.created_at);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.queue_notification_deliveries() FROM PUBLIC;
CREATE TRIGGER queue_notification_deliveries AFTER INSERT ON app.notifications
  FOR EACH ROW EXECUTE FUNCTION app.queue_notification_deliveries();

-- One-click unsubscribe from a letter (RFC 8058). The API calls it only after it verified the signed link of that
-- person; it turns e-mail off and nothing else, and waiting letters are dropped when their batch is checked.
CREATE FUNCTION app.turn_off_email_notifications(person text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=person AND p.kind='human') THEN RETURN false; END IF;
  UPDATE app.notification_preferences SET email_enabled=false,revision=revision+1,updated_at=clock_timestamp()
  WHERE principal_id=person AND email_enabled;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.turn_off_email_notifications(text) FROM PUBLIC;
