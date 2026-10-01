-- Personal notifications (docs/decisions/0006-notifications-telegram.md): events that ask something of one person —
-- a task assigned to them by someone else, a mention in a discussion, a request addressed to them, a deadline of their
-- task tomorrow. Watched-task changes stay in the Workbench («Изменилось», docs/adr W3); these are not a second feed.
-- Rows hold codes, dates and ids only: the line a person reads is composed from the task as it is when shown.
CREATE TABLE app.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL REFERENCES auth.principals,
  project_id text NOT NULL REFERENCES app.projects,
  task_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('assigned','mention','request','deadline')),
  -- Who caused it; none for a deadline. Never the recipient: nobody is told about their own action.
  actor_id text REFERENCES auth.principals,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object' AND octet_length(detail::text)<=1000),
  -- One notification per cause and person: a repeated trigger or a replayed command adds nothing.
  dedupe_key text NOT NULL CHECK(length(dedupe_key) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  UNIQUE(recipient_id,dedupe_key),
  FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
  CHECK(actor_id IS DISTINCT FROM recipient_id),
  CHECK((kind='deadline')=(actor_id IS NULL))
);
CREATE INDEX notifications_feed ON app.notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread ON app.notifications(recipient_id) WHERE read_at IS NULL;

-- What a person wants delivered outside the product. In the product every notification is always shown.
-- Telegram per kind: listed kinds are muted, so a kind added later reaches Telegram unless the person mutes it.
CREATE TABLE app.notification_preferences (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  telegram_muted text[] NOT NULL DEFAULT '{}'
    CHECK(telegram_muted <@ ARRAY['assigned','mention','request','deadline']::text[] AND cardinality(telegram_muted)<=4),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Telegram. A one-time link token: only its SHA-256 is kept, for fifteen minutes.
CREATE TABLE app.telegram_link_tokens (
  token_sha256 text PRIMARY KEY CHECK(token_sha256 ~ '^[0-9a-f]{64}$'),
  principal_id text NOT NULL REFERENCES auth.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
CREATE INDEX telegram_link_tokens_person ON app.telegram_link_tokens(principal_id,created_at DESC);

-- One chat per person and one person per chat; linking again replaces both sides.
CREATE TABLE app.telegram_connections (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  chat_id bigint NOT NULL UNIQUE,
  username text CHECK(username ~ '^[A-Za-z0-9_]{1,64}$'),
  linked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A project's switch for Telegram delivery. No row: on (docs/decisions/0006-notifications-telegram.md).
CREATE TABLE app.telegram_project_settings (
  project_id text PRIMARY KEY REFERENCES app.projects,
  enabled boolean NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_by text NOT NULL REFERENCES auth.principals,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The outbox of Telegram messages: one row per notification whose person, preference and project allowed it when it
-- was raised. The worker checks them again when it sends, and reads the chat then: a later link wins.
CREATE TABLE app.telegram_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES app.notifications,
  recipient_id text NOT NULL REFERENCES auth.principals,
  project_id text NOT NULL REFERENCES app.projects,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  chat_id bigint,
  last_error_code text CHECK(length(last_error_code)<=80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CHECK((state='sending')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK((state='sent')=(sent_at IS NOT NULL))
);
CREATE INDEX telegram_deliveries_due ON app.telegram_deliveries(next_attempt_at) WHERE state IN ('pending','sending');

-- Webhook idempotency: Telegram repeats an update until it gets an answer; each update_id is handled once.
CREATE TABLE app.telegram_updates (
  update_id bigint PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX telegram_updates_age ON app.telegram_updates(received_at);

-- Row security. The owner of these tables is the owner of the functions in the next migrations, which raise,
-- deliver and link outside a request's own rows; the API role sees only a person's own rows.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['notifications','notification_preferences','telegram_link_tokens','telegram_connections',
      'telegram_project_settings','telegram_deliveries','telegram_updates'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY definer_policy ON app.%I USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=%L::regclass))) WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=%L::regclass)))',
      tab,'app.'||tab,'app.'||tab);
  END LOOP;
END $$;
-- A person reads their notifications while they can see the project, and marks them read (W2: revoking access hides
-- them without deleting them). Nobody inserts one directly: raising goes through the functions of V…043.
CREATE POLICY own_read ON app.notifications FOR SELECT USING(recipient_id=auth.actor_id() AND auth.can_project(project_id));
CREATE POLICY own_mark ON app.notifications FOR UPDATE
  USING(recipient_id=auth.actor_id() AND auth.can_project(project_id))
  WITH CHECK(recipient_id=auth.actor_id() AND auth.can_project(project_id));
CREATE POLICY own_policy ON app.notification_preferences USING(principal_id=auth.actor_id()) WITH CHECK(principal_id=auth.actor_id());
CREATE POLICY own_read ON app.telegram_link_tokens FOR SELECT USING(principal_id=auth.actor_id());
CREATE POLICY own_insert ON app.telegram_link_tokens FOR INSERT WITH CHECK(principal_id=auth.actor_id() AND consumed_at IS NULL);
CREATE POLICY own_read ON app.telegram_connections FOR SELECT USING(principal_id=auth.actor_id());
CREATE POLICY own_unlink ON app.telegram_connections FOR DELETE USING(principal_id=auth.actor_id());
-- Members see the switch; those who may configure the project change it.
CREATE POLICY member_read ON app.telegram_project_settings FOR SELECT USING(auth.can_project(project_id));
CREATE POLICY settings_insert ON app.telegram_project_settings FOR INSERT
  WITH CHECK(auth.can(project_id,'project.settings') AND updated_by=auth.actor_id());
CREATE POLICY settings_update ON app.telegram_project_settings FOR UPDATE
  USING(auth.can(project_id,'project.settings')) WITH CHECK(auth.can(project_id,'project.settings') AND updated_by=auth.actor_id());
