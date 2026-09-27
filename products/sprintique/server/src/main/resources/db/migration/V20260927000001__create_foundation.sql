CREATE SCHEMA auth;
CREATE SCHEMA app;
CREATE TABLE auth.principals (
  id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('human','agent')),
  name text NOT NULL, issuer text, subject text, disabled_at timestamptz,
  UNIQUE(issuer,subject), CHECK ((kind='human') = (issuer IS NOT NULL AND subject IS NOT NULL))
);
CREATE TABLE auth.credentials (
  id text PRIMARY KEY, principal_id text NOT NULL REFERENCES auth.principals,
  token_hash text NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('session','agent')),
  csrf text, project_id text, capabilities text[] NOT NULL DEFAULT '{}',
  initiator_id text NOT NULL REFERENCES auth.principals,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  CHECK ((kind='session') = (csrf IS NOT NULL AND project_id IS NULL))
);
CREATE TABLE auth.login_states (state_hash text PRIMARY KEY, verifier text NOT NULL, nonce text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE app.workspaces (id uuid PRIMARY KEY, name text NOT NULL, created_by text NOT NULL REFERENCES auth.principals);
CREATE TABLE app.workspace_members (workspace_id uuid REFERENCES app.workspaces, principal_id text REFERENCES auth.principals, role text NOT NULL CHECK(role IN ('member','admin')), PRIMARY KEY(workspace_id,principal_id));
CREATE TABLE app.projects (
  id text PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES app.workspaces,
  name text NOT NULL, slug text NOT NULL UNIQUE, key text NOT NULL, next_task_number integer NOT NULL DEFAULT 1 CHECK(next_task_number>0),
  UNIQUE(workspace_id,key), UNIQUE(workspace_id,id)
);
CREATE TABLE app.project_members (project_id text REFERENCES app.projects, principal_id text REFERENCES auth.principals, role text NOT NULL CHECK(role IN ('reader','editor','admin')), PRIMARY KEY(project_id,principal_id));
ALTER TABLE auth.credentials ADD FOREIGN KEY(project_id) REFERENCES app.projects;
CREATE FUNCTION auth.actor_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor_id',true),'') $$;
-- Owned by migration role, fixed search path; never accept an actor from caller JSON.
CREATE FUNCTION auth.can_project(target text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.project_members WHERE project_id=target AND principal_id=auth.actor_id())
 AND (coalesce(current_setting('app.project_limit',true),'')='' OR current_setting('app.project_limit',true)=target)
$$;
CREATE FUNCTION auth.can_workspace(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.workspace_members WHERE workspace_id=target AND principal_id=auth.actor_id())
$$;
CREATE TABLE app.tags (id text NOT NULL, project_id text NOT NULL REFERENCES app.projects, name text NOT NULL, tone text NOT NULL CHECK(tone IN ('neutral','blue','purple','green','amber','red')), revision integer NOT NULL CHECK(revision>0), archived_at timestamptz, PRIMARY KEY(project_id,id));
CREATE TABLE app.releases (id text NOT NULL, project_id text NOT NULL REFERENCES app.projects, name text NOT NULL, status text NOT NULL CHECK(status IN ('planned','released')), target_date date, revision integer NOT NULL CHECK(revision>0), archived_at timestamptz, PRIMARY KEY(project_id,id));
CREATE TABLE app.tasks (
  id text NOT NULL, project_id text NOT NULL REFERENCES app.projects, number integer NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240), description text NOT NULL CHECK(length(description)<=10000),
  status text NOT NULL CHECK(status IN ('ready','in_progress','review','ready_for_testing','testing','ready_for_release')),
  type text NOT NULL CHECK(type IN ('task','bug','epic')), priority text NOT NULL CHECK(priority IN ('low','normal','high','critical')),
  owner_label text NOT NULL, due date, rank double precision NOT NULL,
  parent_id text, release_id text, revision integer NOT NULL CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), status_entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id), UNIQUE(project_id,number),
  FOREIGN KEY(project_id,parent_id) REFERENCES app.tasks(project_id,id),
  FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id), CHECK(parent_id IS DISTINCT FROM id)
);
CREATE TABLE app.task_tags (project_id text NOT NULL, task_id text NOT NULL, tag_id text NOT NULL, PRIMARY KEY(project_id,task_id,tag_id), FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id), FOREIGN KEY(project_id,tag_id) REFERENCES app.tags(project_id,id));
CREATE TABLE app.threads (
  id text NOT NULL, project_id text NOT NULL, task_id text NOT NULL, requires_resolution boolean NOT NULL,
  resolved boolean NOT NULL DEFAULT false, resolved_by text REFERENCES auth.principals, resolved_at timestamptz,
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id), CHECK(NOT resolved OR requires_resolution)
);
CREATE TABLE app.messages (
  id text NOT NULL, project_id text NOT NULL, thread_id text NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),
  author_id text NOT NULL REFERENCES auth.principals, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,thread_id) REFERENCES app.threads(project_id,id)
);
CREATE INDEX thread_task_page ON app.threads(project_id,task_id,last_activity_at DESC,id);
CREATE INDEX message_thread_page ON app.messages(project_id,thread_id,created_at,id);
CREATE TABLE app.idempotency (
  actor_id text NOT NULL REFERENCES auth.principals, project_id text NOT NULL REFERENCES app.projects,
  operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_id,project_id,operation,key)
);
CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES app.projects, actor_id text NOT NULL REFERENCES auth.principals,
  initiator_id text NOT NULL REFERENCES auth.principals, action text NOT NULL, resource_id text NOT NULL,
  revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app.outbox (
  id uuid PRIMARY KEY REFERENCES app.audit_events, project_id text NOT NULL REFERENCES app.projects,
  topic text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_until timestamptz
);
CREATE INDEX outbox_pending ON app.outbox(available_at) WHERE delivered_at IS NULL;
ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_read ON app.projects FOR SELECT USING(auth.can_project(id));
CREATE POLICY projects_insert ON app.projects FOR INSERT WITH CHECK(auth.can_workspace(workspace_id));
CREATE POLICY projects_update ON app.projects FOR UPDATE USING(auth.can_project(id));
ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON app.workspaces FOR SELECT USING(auth.can_workspace(id));
CREATE POLICY workspace_insert ON app.workspaces FOR INSERT WITH CHECK(created_by=auth.actor_id());
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['tags','releases','tasks','task_tags','threads','messages','idempotency','audit_events','outbox'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_policy ON app.%I USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id))',tab);
  END LOOP;
END $$;
-- Membership tables are policy input, not business collections. HTTP never exposes arbitrary SQL/table operations.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
