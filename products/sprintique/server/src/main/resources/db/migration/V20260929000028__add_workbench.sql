-- Workbench (docs/adr W1–W5): directed requests, personal task state ("Участвую", "Жду"), private receipts and
-- preferences.
-- Additive only. Personal tables are visible to their owner alone; requests are shared project objects.

-- A thread is a request source only on its own task: the pair is referenced, not just the thread.
ALTER TABLE app.threads ADD CONSTRAINT thread_task_identity UNIQUE(project_id,task_id,id);

-- W1. An exact human recipient and a typed canonical source; the request is an envelope, not a second truth.
CREATE TABLE app.attention_requests (
  project_id text NOT NULL REFERENCES app.projects,
  id uuid NOT NULL,
  task_id text NOT NULL,
  recipient_id text NOT NULL REFERENCES auth.principals,
  requested_by text NOT NULL REFERENCES auth.principals,
  -- What is asked: an answer to a question, a review, a decision, an approval of a proposal, or to do something.
  kind text NOT NULL CHECK(kind IN ('answer','review','decision','approval','do')),
  thread_id text,
  approval_id uuid,
  note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','cancelled','orphaned')),
  -- A calendar date in the project's time zone, like a task's due date.
  needed_by date,
  source_revision bigint,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- When the request reached its current recipient: a snooze hides only what reached the person before it.
  addressed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  closed_by text REFERENCES auth.principals,
  PRIMARY KEY(project_id,id),
  FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
  FOREIGN KEY(project_id,task_id,thread_id) REFERENCES app.threads(project_id,task_id,id),
  FOREIGN KEY(project_id,approval_id) REFERENCES app.approvals(project_id,id),
  CHECK(recipient_id<>requested_by),
  CHECK(thread_id IS NULL OR approval_id IS NULL),
  CHECK((kind='approval')=(approval_id IS NOT NULL)),
  CHECK((status IN ('resolved','cancelled'))=(closed_at IS NOT NULL AND closed_by IS NOT NULL))
);
CREATE INDEX attention_request_recipient ON app.attention_requests(recipient_id,project_id) WHERE status='open';
CREATE INDEX attention_request_requester ON app.attention_requests(requested_by,project_id,updated_at DESC);
CREATE INDEX attention_request_task ON app.attention_requests(project_id,task_id,created_at);
CREATE INDEX attention_request_thread ON app.attention_requests(project_id,thread_id) WHERE thread_id IS NOT NULL AND status='open';
CREATE INDEX attention_request_approval ON app.attention_requests(project_id,approval_id) WHERE approval_id IS NOT NULL AND status='open';

-- W2/W3/W5. One row per person and task; each field has its own revision, so independent commands never collide.
-- "Участвую" is one private flag: the person tracks the task and keeps it on their Workbench. "Жду" is derived from
-- it (a participating task the person assigned to someone else), with a private check-back date.
CREATE TABLE app.task_personal_state (
  project_id text NOT NULL,
  task_id text NOT NULL,
  principal_id text NOT NULL REFERENCES auth.principals,
  participating boolean NOT NULL DEFAULT false,
  participation_revision bigint NOT NULL DEFAULT 0 CHECK(participation_revision>=0),
  -- The person's own order of what they participate in; kept only while participating.
  rank bigint CHECK(rank>0),
  rank_revision bigint NOT NULL DEFAULT 0 CHECK(rank_revision>=0),
  last_seen_sequence bigint CHECK(last_seen_sequence>=0),
  seen_revision bigint NOT NULL DEFAULT 0 CHECK(seen_revision>=0),
  snoozed_until timestamptz,
  snoozed_at timestamptz,
  snooze_revision bigint NOT NULL DEFAULT 0 CHECK(snooze_revision>=0),
  -- A calendar date of the person's own check of delegated work; never the task's due date.
  check_back_at date,
  check_back_revision bigint NOT NULL DEFAULT 0 CHECK(check_back_revision>=0),
  -- "Принять результат": the delegation (its owner event position) whose done result the person accepted; while the
  -- task stays done it is no longer "Жду". A later assignment or a reopened task waits again.
  accepted_sequence bigint CHECK(accepted_sequence>0),
  accept_revision bigint NOT NULL DEFAULT 0 CHECK(accept_revision>=0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,task_id,principal_id),
  FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
  CHECK((snoozed_until IS NULL)=(snoozed_at IS NULL)),
  -- Exactly the rows the person participates in have a rank: the order never holds a gap or a stray row.
  CHECK(participating=(rank IS NOT NULL))
);
CREATE INDEX personal_state_principal ON app.task_personal_state(principal_id,project_id,task_id);
CREATE INDEX personal_state_participating ON app.task_personal_state(principal_id,rank) WHERE participating;

-- W2. The retry ledger of personal commands: principal-scoped, append-only, no titles or text.
CREATE TABLE app.private_receipts (
  principal_id text NOT NULL REFERENCES auth.principals,
  project_id text NOT NULL REFERENCES app.projects,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  resource_id text NOT NULL,
  effect_revision bigint NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Reserved for the collector of old receipts after the MVP (docs/adr W2); nothing writes it yet.
  expires_at timestamptz,
  PRIMARY KEY(principal_id,project_id,operation,key)
);

-- W5. The time zone a person chose for the plan lens (null: not chosen) and the layout of their Workbench: hidden
-- widgets and the form of "Текущая работа" (docs/workbench/design-v2.md §5.1). The server validates the layout.
CREATE TABLE app.workbench_preferences (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  timezone text CHECK(length(timezone) BETWEEN 1 AND 100),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(layout)='object' AND octet_length(layout::text)<=2000),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The per-recipient limit counts every project, not only those the requester can see; only the number leaves.
CREATE FUNCTION auth.open_requests_for(recipient text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT count(*)::integer FROM app.attention_requests r
  WHERE r.recipient_id=recipient AND r.status='open'
    AND (r.approval_id IS NULL OR EXISTS(SELECT 1 FROM app.approvals a WHERE a.project_id=r.project_id AND a.id=r.approval_id
         AND a.status='proposed' AND a.expires_at>clock_timestamp()))
$$;
REVOKE ALL ON FUNCTION auth.open_requests_for(text) FROM PUBLIC;

ALTER TABLE app.attention_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attention_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON app.attention_requests USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['task_personal_state','private_receipts'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    -- Own rows only, and only while the project is accessible: revoking access hides them without deleting them.
    EXECUTE format('CREATE POLICY own_policy ON app.%I USING(principal_id=auth.actor_id() AND auth.can_project(project_id)) WITH CHECK(principal_id=auth.actor_id() AND auth.can_project(project_id))',tab);
  END LOOP;
END $$;
ALTER TABLE app.workbench_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workbench_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY own_policy ON app.workbench_preferences USING(principal_id=auth.actor_id()) WITH CHECK(principal_id=auth.actor_id());
