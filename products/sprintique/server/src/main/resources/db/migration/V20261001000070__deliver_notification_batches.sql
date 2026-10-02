-- The worker's narrow functions for batches (docs/decisions/0007-notification-channels.md): take the next batch whose
-- window closed, check every item of it again as the person, and settle what was sent. The worker role reads no
-- table; what it needs to compose the message comes back from the claim.

-- Why a queued item must not be sent now, or null. Checked as the recipient (work.act_as), exactly as V…044 checked a
-- Telegram message, plus the person's choice of channel.
CREATE FUNCTION work.notification_skip_reason(delivery app.notification_deliveries,item app.notifications) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE task record;choice app.notification_preferences;
BEGIN
  IF item.read_at IS NOT NULL THEN RETURN 'READ'; END IF;
  IF item.created_at<clock_timestamp()-interval '24 hours' THEN RETURN 'EXPIRED'; END IF;
  SELECT * INTO choice FROM app.notification_preferences n WHERE n.principal_id=delivery.recipient_id;
  IF delivery.channel='telegram' THEN
    IF NOT coalesce(choice.telegram_enabled,true) THEN RETURN 'CHANNEL_OFF'; END IF;
    IF NOT EXISTS(SELECT 1 FROM app.telegram_connections c WHERE c.principal_id=delivery.recipient_id) THEN RETURN 'NOT_LINKED'; END IF;
  ELSE
    IF NOT coalesce(choice.email_enabled,true) THEN RETURN 'CHANNEL_OFF'; END IF;
    IF NOT EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=delivery.recipient_id AND p.email IS NOT NULL) THEN RETURN 'NO_ADDRESS'; END IF;
  END IF;
  IF item.kind=ANY(coalesce(choice.muted_kinds,'{}')) THEN RETURN 'MUTED'; END IF;
  IF NOT coalesce((SELECT s.enabled FROM app.project_notification_settings s WHERE s.project_id=delivery.project_id),true) THEN
    RETURN 'PROJECT_OFF';
  END IF;
  -- Also refuses a service account or an agent: only enabled people with the right to read the project's tasks.
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

-- Checks each listed item as its person and settles the ones that may no longer go as skipped. Returns the rest.
CREATE FUNCTION work.keep_deliverable(person text,candidates uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE delivery app.notification_deliveries;item app.notifications;reason text;kept uuid[]:='{}';
BEGIN
  PERFORM work.act_as(person);
  FOR delivery IN SELECT * FROM app.notification_deliveries d WHERE d.id=ANY(candidates) ORDER BY d.created_at,d.id LOOP
    SELECT * INTO item FROM app.notifications n WHERE n.id=delivery.notification_id;
    reason:=work.notification_skip_reason(delivery,item);
    IF reason IS NULL THEN
      kept:=kept||delivery.id;
    ELSE
      UPDATE app.notification_deliveries SET state='skipped',last_error_code=reason WHERE id=delivery.id;
    END IF;
  END LOOP;
  PERFORM work.act_as(NULL);
  RETURN kept;
END $$;

-- The quick actions a person may take on a notification now (docs/decisions/0007-notification-channels.md), checked
-- under the caller's row security and rights: the bell's API reads them as the person, the worker after work.act_as.
-- An assignment can be taken into work while the task is still «ready»; an open review request addressed to them can
-- be accepted or returned; their own due date can be moved; a mention can be answered in its thread.
CREATE FUNCTION app.notification_actions(item app.notifications) RETURNS text[]
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN item.kind='assigned' AND t.owner_id=item.recipient_id AND t.status='ready' AND t.result<>'accepted'
      AND auth.can(item.project_id,'tasks.write') THEN 'take' END,
    CASE WHEN item.kind='request' AND r.status='open' AND r.kind='review' AND r.recipient_id=item.recipient_id
      AND auth.can(item.project_id,'tasks.write') THEN 'accept' END,
    CASE WHEN item.kind='request' AND r.status='open' AND r.kind='review' AND r.recipient_id=item.recipient_id
      AND t.status<>'in_progress' AND t.result<>'accepted' AND auth.can(item.project_id,'tasks.write') THEN 'return' END,
    CASE WHEN item.kind='deadline' AND t.owner_id=item.recipient_id AND t.due IS NOT NULL AND t.status<>'ready_for_release'
      AND t.result<>'accepted' AND auth.can(item.project_id,'tasks.write') THEN 'postpone' END,
    CASE WHEN item.kind='mention' AND EXISTS(SELECT 1 FROM app.threads h WHERE h.project_id=item.project_id
        AND h.id=item.detail->>'threadId') AND auth.can(item.project_id,'threads.write') THEN 'reply' END
  ],NULL)
  FROM app.tasks t
  LEFT JOIN app.attention_requests r ON r.project_id=item.project_id AND r.id::text=item.detail->>'requestId'
  WHERE t.project_id=item.project_id AND t.id=item.task_id AND item.recipient_id=auth.actor_id()
$$;

-- Takes the next batch to send with a one-minute lease, or null. A batch due for another attempt comes first; then
-- the person and channel whose window closed earliest (the window starts at their oldest waiting item), or who has
-- twenty waiting. At most twenty items a batch. Items that may no longer go are settled as skipped on the way, and a
-- batch with nothing left is never sent. `channels` are the ones this worker can send; windows are in seconds.
CREATE FUNCTION work.claim_notification_batch(channels text[],telegram_window integer,email_window integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch app.notification_batches;waiting record;candidates uuid[];kept uuid[];zone text;local timestamp;
  chat bigint;address text;items jsonb;
  tw integer:=least(greatest(coalesce(telegram_window,300),0),3600);
  ew integer:=least(greatest(coalesce(email_window,900),0),3600);
BEGIN
  -- A lease that ran out on the fifth attempt: the batch and its waiting items failed.
  WITH dead AS (
    UPDATE app.notification_batches SET state='failed',lease_token=NULL,lease_until=NULL,
        last_error_code=coalesce(last_error_code,'ATTEMPTS_EXHAUSTED')
    WHERE state='sending' AND lease_until<clock_timestamp() AND attempts>=5 RETURNING id)
  UPDATE app.notification_deliveries SET state='failed',last_error_code='ATTEMPTS_EXHAUSTED'
  WHERE state='batched' AND batch_id IN (SELECT id FROM dead);
  -- Items of a channel no worker serves (e-mail before a mail transport is set up) would wait forever: after a day
  -- they are settled as expired, a few hundred at a time.
  UPDATE app.notification_deliveries SET state='skipped',last_error_code='EXPIRED'
  WHERE id IN (SELECT d.id FROM app.notification_deliveries d WHERE d.state='queued'
    AND d.created_at<clock_timestamp()-interval '24 hours' ORDER BY d.created_at LIMIT 500);
  FOR pass IN 1..20 LOOP
    batch:=NULL;chat:=NULL;address:=NULL;
    SELECT * INTO batch FROM app.notification_batches b
    WHERE b.channel=ANY(channels) AND ((b.state='pending' AND b.next_attempt_at<=clock_timestamp())
       OR (b.state='sending' AND b.lease_until<clock_timestamp()))
    ORDER BY b.next_attempt_at,b.id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF batch.id IS NOT NULL THEN
      SELECT coalesce(array_agg(d.id),'{}') INTO candidates FROM app.notification_deliveries d
      WHERE d.batch_id=batch.id AND d.state='batched';
      kept:=work.keep_deliverable(batch.recipient_id,candidates);
      IF cardinality(kept)=0 THEN
        UPDATE app.notification_batches SET state='skipped',lease_token=NULL,lease_until=NULL,last_error_code='NOTHING_LEFT'
        WHERE id=batch.id;
        CONTINUE;
      END IF;
      UPDATE app.notification_batches SET state='sending',attempts=attempts+1,lease_token=gen_random_uuid(),
          lease_until=clock_timestamp()+interval '60 seconds'
        WHERE id=batch.id RETURNING * INTO batch;
    ELSE
      SELECT d.recipient_id,d.channel INTO waiting FROM app.notification_deliveries d
      WHERE d.state='queued' AND d.channel=ANY(channels)
      GROUP BY d.recipient_id,d.channel
      HAVING count(*)>=20
          OR min(d.created_at)<=clock_timestamp()-make_interval(secs=>CASE d.channel WHEN 'telegram' THEN tw ELSE ew END)
      ORDER BY min(d.created_at) LIMIT 1;
      IF waiting.recipient_id IS NULL THEN RETURN NULL; END IF;
      SELECT coalesce(array_agg(q.id),'{}') INTO candidates FROM (
        SELECT d.id FROM app.notification_deliveries d
        WHERE d.recipient_id=waiting.recipient_id AND d.channel=waiting.channel AND d.state='queued'
        ORDER BY d.created_at,d.id LIMIT 20 FOR UPDATE SKIP LOCKED) q;
      IF cardinality(candidates)=0 THEN RETURN NULL; END IF;
      kept:=work.keep_deliverable(waiting.recipient_id,candidates);
      IF cardinality(kept)=0 THEN CONTINUE; END IF;
      INSERT INTO app.notification_batches(recipient_id,channel,state,attempts,lease_token,lease_until)
      VALUES(waiting.recipient_id,waiting.channel,'sending',1,gen_random_uuid(),clock_timestamp()+interval '60 seconds')
      RETURNING * INTO batch;
      UPDATE app.notification_deliveries SET state='batched',batch_id=batch.id WHERE id=ANY(kept);
    END IF;
    -- The address of this attempt: the person's current chat, or the e-mail of their account.
    IF batch.channel='telegram' THEN
      SELECT c.chat_id INTO chat FROM app.telegram_connections c WHERE c.principal_id=batch.recipient_id;
      UPDATE app.notification_batches SET chat_id=chat WHERE id=batch.id;
    ELSE
      SELECT p.email INTO address FROM auth.principals p WHERE p.id=batch.recipient_id;
    END IF;
    -- What the message says is read as the person, from the tasks as they are now.
    PERFORM work.act_as(batch.recipient_id);
    SELECT jsonb_agg(jsonb_build_object(
        'id',d.id,'notificationId',n.id,'kind',n.kind,'detail',n.detail,'createdAt',n.created_at,
        'actions',to_jsonb(coalesce(app.notification_actions(n),'{}')),
        'actorName',(SELECT coalesce(a.profile_name,a.name) FROM auth.principals a WHERE a.id=n.actor_id),
        'taskId',t.id,'taskTitle',t.title,'taskKey',p.key||'-'||t.number,
        'projectId',p.id,'projectSlug',p.slug,'projectName',p.name,
        'quote',CASE WHEN n.kind='mention' THEN (SELECT left(m.body,2000) FROM app.messages m
          WHERE m.project_id=n.project_id AND m.id=n.detail->>'messageId') END)
      ORDER BY d.created_at,d.id) INTO items
    FROM app.notification_deliveries d
    JOIN app.notifications n ON n.id=d.notification_id
    JOIN app.tasks t ON t.project_id=n.project_id AND t.id=n.task_id
    JOIN app.projects p ON p.id=n.project_id
    WHERE d.batch_id=batch.id AND d.state='batched';
    -- Dates read in the person's time zone: the Workbench one, else the project's of the first item, else UTC.
    zone:=coalesce((SELECT w.timezone FROM app.workbench_preferences w WHERE w.principal_id=batch.recipient_id),
      auth.project_timezone(items->0->>'projectId'),'UTC');
    PERFORM work.act_as(NULL);
    BEGIN
      local:=clock_timestamp() AT TIME ZONE zone;
    EXCEPTION WHEN invalid_parameter_value THEN
      zone:='UTC';local:=clock_timestamp() AT TIME ZONE zone;
    END;
    RETURN jsonb_build_object('id',batch.id,'leaseToken',batch.lease_token,'channel',batch.channel,
      'attempts',batch.attempts,'recipientId',batch.recipient_id,'chatId',chat::text,'email',address,
      'zone',zone,'today',local::date,'items',coalesce(items,'[]'::jsonb));
  END LOOP;
  RETURN NULL;
END $$;

-- Settles a lease. `delivered` names the items already accepted (the parts of a split Telegram message that went
-- through): they are sent whatever happens to the rest. Outcomes: sent; retry later (at least retry_after seconds,
-- Telegram's 429 answer, else backoff from 10 s to about 11 minutes); failed with a code; or blocked — the person
-- blocked the bot, so that chat is unlinked.
CREATE FUNCTION work.settle_notification_batch(target uuid,lease uuid,outcome text,error_code text,retry_after integer,
    delivered uuid[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch app.notification_batches;code text:=left(coalesce(error_code,'SEND_FAILED'),80);
BEGIN
  SELECT * INTO batch FROM app.notification_batches b
  WHERE b.id=target AND b.lease_token=lease AND b.state='sending' AND b.lease_until>clock_timestamp() FOR UPDATE;
  IF batch.id IS NULL THEN RETURN false; END IF;
  UPDATE app.notification_deliveries SET state='sent',sent_at=clock_timestamp(),last_error_code=NULL
  WHERE batch_id=batch.id AND state='batched' AND (outcome='sent' OR id=ANY(coalesce(delivered,'{}')));
  IF outcome='sent' THEN
    UPDATE app.notification_batches SET state='sent',sent_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,
        last_error_code=NULL
      WHERE id=batch.id;
  ELSIF outcome='retry' AND batch.attempts<5 THEN
    UPDATE app.notification_batches SET state='pending',lease_token=NULL,lease_until=NULL,last_error_code=code,
        next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(coalesce(retry_after,0),3600),
          least(3600,10*power(4,batch.attempts-1)::integer)))
      WHERE id=batch.id;
  ELSE
    IF outcome='blocked' THEN
      code:='BOT_BLOCKED';
      DELETE FROM app.telegram_connections WHERE principal_id=batch.recipient_id AND chat_id=batch.chat_id;
    END IF;
    UPDATE app.notification_deliveries SET state='failed',last_error_code=code WHERE batch_id=batch.id AND state='batched';
    UPDATE app.notification_batches SET state='failed',lease_token=NULL,lease_until=NULL,last_error_code=code
      WHERE id=batch.id;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.notification_actions(app.notifications) FROM PUBLIC;
REVOKE ALL ON FUNCTION work.notification_skip_reason(app.notification_deliveries,app.notifications),
  work.keep_deliverable(text,uuid[]),work.claim_notification_batch(text[],integer,integer),
  work.settle_notification_batch(uuid,uuid,text,text,integer,uuid[]) FROM PUBLIC;

-- Quick actions from Telegram (docs/decisions/0007-notification-channels.md). A button press or a reply in a private
-- chat acts for the person the chat is linked to, with their current rights, like a signed-in request. The webhook has
-- no session: this function names that person, and the API checks it again before every write.
CREATE FUNCTION app.telegram_chat_person(chat bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT c.principal_id FROM app.telegram_connections c JOIN auth.principals p ON p.id=c.principal_id
  WHERE c.chat_id=chat AND p.kind='human' AND p.disabled_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.telegram_chat_person(bigint) FROM PUBLIC;

-- A write made from a Telegram button or reply is audited as such (credential kind `telegram`).
DO $$ DECLARE found text; BEGIN
  SELECT conname INTO STRICT found FROM pg_constraint
  WHERE conrelid='app.audit_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%credential_kind%';
  EXECUTE format('ALTER TABLE app.audit_events DROP CONSTRAINT %I',found);
END $$;
ALTER TABLE app.audit_events ADD CONSTRAINT audit_credential_kind
  CHECK(credential_kind IS NULL OR credential_kind IN ('session','agent','service','oauth','runtime','telegram'));
