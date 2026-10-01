-- Telegram linking for the webhook, and the worker's narrow functions: deadlines and the delivery queue
-- (docs/decisions/0006-notifications-telegram.md). The webhook has no signed-in person and the worker role reads no
-- table, so each step is a function owned by the table owner that does exactly that step.

-- Webhook idempotency: true the first time an update arrives. Old ids are dropped after a week, longer than Telegram
-- keeps retrying an update.
CREATE FUNCTION app.telegram_accept_update(update bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE inserted integer;
BEGIN
  DELETE FROM app.telegram_updates WHERE update_id IN (SELECT u.update_id FROM app.telegram_updates u
    WHERE u.received_at<clock_timestamp()-interval '7 days' ORDER BY u.received_at LIMIT 100);
  INSERT INTO app.telegram_updates(update_id) VALUES(update) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted=1;
END $$;

-- "/start <token>": the chat becomes the person's, once per token and only while it is fresh. One chat per person and
-- one person per chat: linking again replaces the person's old chat, and the chat's old person loses it.
CREATE FUNCTION app.telegram_link_chat(token_hash text,chat bigint,handle text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link app.telegram_link_tokens;
BEGIN
  DELETE FROM app.telegram_link_tokens WHERE token_sha256 IN (SELECT t.token_sha256 FROM app.telegram_link_tokens t
    WHERE t.expires_at<clock_timestamp()-interval '1 day' LIMIT 100);
  SELECT * INTO link FROM app.telegram_link_tokens WHERE token_sha256=token_hash FOR UPDATE;
  IF link.token_sha256 IS NULL OR link.consumed_at IS NOT NULL THEN RETURN 'invalid'; END IF;
  IF link.expires_at<=clock_timestamp() THEN RETURN 'expired'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=link.principal_id AND p.kind='human' AND p.disabled_at IS NULL) THEN
    RETURN 'invalid';
  END IF;
  -- The token and every other open token of the person are spent: one link opens one chat.
  UPDATE app.telegram_link_tokens SET consumed_at=clock_timestamp() WHERE principal_id=link.principal_id AND consumed_at IS NULL;
  DELETE FROM app.telegram_connections WHERE chat_id=chat AND principal_id<>link.principal_id;
  INSERT INTO app.telegram_connections(principal_id,chat_id,username) VALUES(link.principal_id,chat,handle)
  ON CONFLICT (principal_id) DO UPDATE SET chat_id=EXCLUDED.chat_id,username=EXCLUDED.username,linked_at=clock_timestamp();
  RETURN 'linked';
END $$;

-- "/stop" in the chat, or the bot blocked by the person.
CREATE FUNCTION app.telegram_unlink_chat(chat bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM app.telegram_connections WHERE chat_id=chat;
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed>0;
END $$;
REVOKE ALL ON FUNCTION app.telegram_accept_update(bigint),app.telegram_link_chat(text,bigint,text),
  app.telegram_unlink_chat(bigint) FROM PUBLIC;

-- Reads below run as the person concerned: their own row security decides what exists (a project they left, a task
-- they no longer see). The settings are cleared before the function returns.
CREATE FUNCTION work.act_as(person text) RETURNS void
LANGUAGE sql SET search_path=pg_catalog AS $$
  SELECT set_config('app.actor_id',coalesce(person,''),true),set_config('app.project_limit','',true),
         set_config('app.initiator_id','',true)
$$;

-- Deadlines: once per task, person and date, from 09:00 of the day before the due date until the due date ends, in
-- the person's time zone (the Workbench one, else the project's). Done work is not reminded.
CREATE FUNCTION work.raise_due_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record;task record;zone text;local timestamp;raised integer:=0;
BEGIN
  FOR member IN SELECT m.project_id,m.principal_id FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id
      WHERE p.kind='human' AND p.disabled_at IS NULL AND 'tasks.read'=ANY(m.permissions) ORDER BY m.project_id,m.principal_id LOOP
    PERFORM work.act_as(member.principal_id);
    zone:=coalesce((SELECT w.timezone FROM app.workbench_preferences w WHERE w.principal_id=member.principal_id),
      auth.project_timezone(member.project_id),'UTC');
    BEGIN
      local:=clock_timestamp() AT TIME ZONE zone;
    EXCEPTION WHEN invalid_parameter_value THEN
      local:=clock_timestamp() AT TIME ZONE 'UTC';
    END;
    FOR task IN SELECT t.id,t.due FROM app.tasks t
        WHERE t.project_id=member.project_id AND t.owner_id=member.principal_id AND t.due BETWEEN local::date AND local::date+1
          AND t.status<>'ready_for_release' AND t.result<>'accepted' LOOP
      IF local>=(task.due-1)+time '09:00' AND app.raise_notification(member.principal_id,member.project_id,task.id,'deadline',NULL,
          jsonb_build_object('due',task.due,'on',local::date),'deadline:'||member.project_id||':'||task.id||':'||task.due) IS NOT NULL THEN
        raised:=raised+1;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM work.act_as(NULL);
  RETURN raised;
END $$;

-- Why a queued message must not be sent now, or null. Checked as the recipient.
CREATE FUNCTION work.telegram_skip_reason(delivery app.telegram_deliveries,item app.notifications) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE task record;
BEGIN
  IF item.read_at IS NOT NULL THEN RETURN 'READ'; END IF;
  IF item.created_at<clock_timestamp()-interval '24 hours' THEN RETURN 'EXPIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.telegram_connections c WHERE c.principal_id=delivery.recipient_id) THEN RETURN 'NOT_LINKED'; END IF;
  IF EXISTS(SELECT 1 FROM app.notification_preferences n WHERE n.principal_id=delivery.recipient_id AND item.kind=ANY(n.telegram_muted)) THEN
    RETURN 'MUTED';
  END IF;
  IF NOT coalesce((SELECT s.enabled FROM app.telegram_project_settings s WHERE s.project_id=delivery.project_id),true) THEN
    RETURN 'PROJECT_OFF';
  END IF;
  IF NOT app.notification_recipient(delivery.project_id,delivery.recipient_id) THEN RETURN 'NO_ACCESS'; END IF;
  SELECT t.owner_id,t.due,(t.status='ready_for_release' OR t.result='accepted') AS done INTO task
  FROM app.tasks t WHERE t.project_id=item.project_id AND t.id=item.task_id;
  IF NOT FOUND THEN RETURN 'NO_ACCESS'; END IF;
  -- The cause still holds: the task is still theirs, the date unchanged, the request still theirs and open.
  IF item.kind='assigned' AND task.owner_id IS DISTINCT FROM delivery.recipient_id THEN RETURN 'STALE'; END IF;
  IF item.kind='deadline' AND (task.owner_id IS DISTINCT FROM delivery.recipient_id OR task.done
      OR task.due IS DISTINCT FROM (item.detail->>'due')::date) THEN RETURN 'STALE'; END IF;
  IF item.kind='request' AND NOT EXISTS(SELECT 1 FROM app.attention_requests r WHERE r.project_id=item.project_id
      AND r.id::text=item.detail->>'requestId' AND r.recipient_id=delivery.recipient_id AND r.status='open') THEN RETURN 'STALE'; END IF;
  RETURN NULL;
END $$;

-- Takes the next due message with a one-minute lease, or null. Messages that may no longer be sent are settled as
-- skipped on the way. What the worker needs to compose the message is returned; the chat is the person's current one.
CREATE FUNCTION work.claim_telegram_delivery() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE delivery app.telegram_deliveries;item app.notifications;reason text;chat bigint;task record;claimed jsonb;
BEGIN
  UPDATE app.telegram_deliveries SET state='failed',lease_token=NULL,lease_until=NULL,
      last_error_code=coalesce(last_error_code,'ATTEMPTS_EXHAUSTED')
    WHERE state='sending' AND lease_until<clock_timestamp() AND attempts>=5;
  FOR attempt IN 1..50 LOOP
    SELECT * INTO delivery FROM app.telegram_deliveries d
    WHERE (d.state='pending' AND d.next_attempt_at<=clock_timestamp()) OR (d.state='sending' AND d.lease_until<clock_timestamp())
    ORDER BY d.next_attempt_at,d.id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF delivery.id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO item FROM app.notifications WHERE id=delivery.notification_id;
    PERFORM work.act_as(delivery.recipient_id);
    reason:=work.telegram_skip_reason(delivery,item);
    IF reason IS NULL THEN
      SELECT t.title,p.key||'-'||t.number AS key,p.slug,p.name AS project_name INTO task
      FROM app.tasks t JOIN app.projects p ON p.id=t.project_id WHERE t.project_id=item.project_id AND t.id=item.task_id;
      IF NOT FOUND THEN reason:='NO_ACCESS'; END IF;
    END IF;
    PERFORM work.act_as(NULL);
    IF reason IS NOT NULL THEN
      UPDATE app.telegram_deliveries SET state='skipped',lease_token=NULL,lease_until=NULL,last_error_code=reason WHERE id=delivery.id;
      CONTINUE;
    END IF;
    SELECT c.chat_id INTO chat FROM app.telegram_connections c WHERE c.principal_id=delivery.recipient_id;
    UPDATE app.telegram_deliveries SET state='sending',attempts=attempts+1,lease_token=gen_random_uuid(),
        lease_until=clock_timestamp()+interval '60 seconds',chat_id=chat
      WHERE id=delivery.id RETURNING * INTO delivery;
    claimed:=jsonb_build_object('id',delivery.id,'leaseToken',delivery.lease_token,'chatId',delivery.chat_id::text,
      'attempts',delivery.attempts,'kind',item.kind,'detail',item.detail,
      'actorName',(SELECT coalesce(p.profile_name,p.name) FROM auth.principals p WHERE p.id=item.actor_id),
      'taskTitle',task.title,'taskKey',task.key,'projectSlug',task.slug,'projectName',task.project_name);
    RETURN claimed;
  END LOOP;
  RETURN NULL;
END $$;

-- Settles a lease: sent; retry later (at least retry_after seconds, Telegram's 429 answer, else backoff from 10 s to
-- about 11 minutes); failed with a code; or blocked — the person blocked the bot, so their chat is unlinked.
CREATE FUNCTION work.settle_telegram_delivery(delivery_id uuid,token uuid,outcome text,error_code text,retry_after integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE delivery app.telegram_deliveries;
BEGIN
  SELECT * INTO delivery FROM app.telegram_deliveries
  WHERE id=delivery_id AND lease_token=token AND state='sending' AND lease_until>clock_timestamp() FOR UPDATE;
  IF delivery.id IS NULL THEN RETURN false; END IF;
  IF outcome='sent' THEN
    UPDATE app.telegram_deliveries SET state='sent',sent_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_error_code=NULL
      WHERE id=delivery.id;
  ELSIF outcome='retry' AND delivery.attempts<5 THEN
    UPDATE app.telegram_deliveries SET state='pending',lease_token=NULL,lease_until=NULL,
        last_error_code=left(coalesce(error_code,'SEND_FAILED'),80),
        next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(coalesce(retry_after,0),3600),
          least(3600,10*power(4,delivery.attempts-1)::integer)))
      WHERE id=delivery.id;
  ELSE
    IF outcome='blocked' THEN
      DELETE FROM app.telegram_connections WHERE principal_id=delivery.recipient_id AND chat_id=delivery.chat_id;
    END IF;
    UPDATE app.telegram_deliveries SET state='failed',lease_token=NULL,lease_until=NULL,
        last_error_code=CASE WHEN outcome='blocked' THEN 'BOT_BLOCKED' ELSE left(coalesce(error_code,'SEND_FAILED'),80) END
      WHERE id=delivery.id;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION work.act_as(text),work.raise_due_notifications(),
  work.telegram_skip_reason(app.telegram_deliveries,app.notifications),work.claim_telegram_delivery(),
  work.settle_telegram_delivery(uuid,uuid,text,text,integer) FROM PUBLIC;
