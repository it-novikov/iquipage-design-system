-- Channels of external notifications (docs/decisions/0007-notification-channels.md). A person sends them to the
-- e-mail of their account, to Telegram, to both or to neither; the bell in the product always shows everything. The
-- kinds they mute apply to every channel. Deliveries are collected per person and channel and sent as one batch.

-- The kinds muted for Telegram become the kinds muted outside the product: the person's choice carries over as it is.
ALTER TABLE app.notification_preferences RENAME COLUMN telegram_muted TO muted_kinds;
ALTER TABLE app.notification_preferences RENAME CONSTRAINT notification_preferences_telegram_muted_check
  TO notification_preferences_muted_kinds_check;
-- E-mail is off until the person turns it on; Telegram is on once a chat is linked, as before.
ALTER TABLE app.notification_preferences
  ADD COLUMN email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN telegram_enabled boolean NOT NULL DEFAULT true;

-- The project switch «Уведомления в Telegram» becomes «Внешние уведомления»: the same rows, permission and revision,
-- now for e-mail and Telegram alike. A project that switched Telegram off keeps every external channel off.
ALTER TABLE app.telegram_project_settings RENAME TO project_notification_settings;
ALTER TABLE app.project_notification_settings RENAME CONSTRAINT telegram_project_settings_pkey TO project_notification_settings_pkey;
ALTER TABLE app.project_notification_settings RENAME CONSTRAINT telegram_project_settings_project_id_fkey
  TO project_notification_settings_project_id_fkey;
ALTER TABLE app.project_notification_settings RENAME CONSTRAINT telegram_project_settings_updated_by_fkey
  TO project_notification_settings_updated_by_fkey;
ALTER TABLE app.project_notification_settings RENAME CONSTRAINT telegram_project_settings_revision_check
  TO project_notification_settings_revision_check;

-- One batch: what one message (Telegram, split at task boundaries when long) or one letter carries to one person.
-- It is made when the person's window closes, holds only the items that passed the check, and is retried as a whole;
-- the parts Telegram already accepted are settled item by item and never sent again.
CREATE TABLE app.notification_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL REFERENCES auth.principals,
  channel text NOT NULL CHECK(channel IN ('telegram','email')),
  state text NOT NULL DEFAULT 'sending' CHECK(state IN ('pending','sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  -- The chat of the latest attempt, so that a 403 unlinks that chat and not a newer one.
  chat_id bigint,
  last_error_code text CHECK(length(last_error_code)<=80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CHECK((state='sending')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK((state='sent')=(sent_at IS NOT NULL)),
  CHECK(chat_id IS NULL OR channel='telegram')
);
CREATE INDEX notification_batches_due ON app.notification_batches(next_attempt_at) WHERE state IN ('pending','sending');

-- The outbox, one row per notification and channel, written in the transaction of the cause. `queued` waits for the
-- person's window; `batched` belongs to a batch being sent; then `sent`, `failed` or `skipped` with a code.
CREATE TABLE app.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES app.notifications,
  channel text NOT NULL CHECK(channel IN ('telegram','email')),
  recipient_id text NOT NULL REFERENCES auth.principals,
  project_id text NOT NULL REFERENCES app.projects,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','batched','sent','failed','skipped')),
  batch_id uuid REFERENCES app.notification_batches,
  last_error_code text CHECK(length(last_error_code)<=80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  UNIQUE(notification_id,channel),
  CHECK(state<>'batched' OR batch_id IS NOT NULL),
  CHECK(state<>'queued' OR batch_id IS NULL),
  CHECK((state='sent')=(sent_at IS NOT NULL))
);
CREATE INDEX notification_deliveries_queued ON app.notification_deliveries(recipient_id,channel,created_at) WHERE state='queued';
CREATE INDEX notification_deliveries_batch ON app.notification_deliveries(batch_id) WHERE batch_id IS NOT NULL;

-- The Telegram outbox of V…042 moves over: waiting rows join the next batch, settled rows keep their history.
INSERT INTO app.notification_deliveries(id,notification_id,channel,recipient_id,project_id,state,last_error_code,created_at,sent_at)
SELECT d.id,d.notification_id,'telegram',d.recipient_id,d.project_id,
       CASE WHEN d.state IN ('pending','sending') THEN 'queued' ELSE d.state END,
       CASE WHEN d.state IN ('pending','sending') THEN NULL ELSE d.last_error_code END,
       d.created_at,d.sent_at
FROM app.telegram_deliveries d;
DROP FUNCTION work.claim_telegram_delivery();
DROP FUNCTION work.settle_telegram_delivery(uuid,uuid,text,text,integer);
DROP FUNCTION work.telegram_skip_reason(app.telegram_deliveries,app.notifications);
DROP TABLE app.telegram_deliveries;

-- Row security as for the rest of notifications: the owner's functions alone read and write the queue.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['notification_batches','notification_deliveries'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY definer_policy ON app.%I USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=%L::regclass))) WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=%L::regclass)))',
      tab,'app.'||tab,'app.'||tab);
  END LOOP;
END $$;
