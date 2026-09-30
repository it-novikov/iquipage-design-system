-- Programmatic access through service accounts (docs/decisions/0003-public-api-mcp.md). An app or a script never acts
-- as a person: it acts as a service account, a principal of its own that a person created and owns, a member of the
-- projects it was granted and never above its owner's rights. It gets tokens for scripts and OAuth 2.1 grants for MCP
-- clients. Every secret is 256 random bits; only its SHA-256 is stored. Like auth.credentials these tables are read
-- before an access context exists, so the runtime role's grants protect them, not row security.

-- A third kind of principal next to people and project agents.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='auth.principals'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''human''%''agent''%';
  EXECUTE format('ALTER TABLE auth.principals DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE auth.principals ADD CONSTRAINT principal_kind CHECK(kind IN ('human','agent','service'));

-- A service account of one workspace. Its owner manages it; while the owner is gone from the workspace or disabled it
-- does nothing, and once suspended it stays so until an administrator gives it a new owner or deletes it. A deleted
-- account keeps its row (and its principal, disabled) for the history it wrote.
CREATE TABLE auth.service_accounts (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  workspace_id uuid NOT NULL REFERENCES app.workspaces,
  owner_id text NOT NULL REFERENCES auth.principals,
  created_by text NOT NULL REFERENCES auth.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  suspended_at timestamptz,
  deleted_at timestamptz,
  CHECK(owner_id<>principal_id)
);
CREATE INDEX service_accounts_owner ON auth.service_accounts(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX service_accounts_workspace ON auth.service_accounts(workspace_id) WHERE deleted_at IS NULL;

-- A service account reads or edits a project; it never administers one, whatever wrote the row.
CREATE FUNCTION auth.service_account_role_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.role='admin' AND EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=NEW.principal_id AND p.kind='service') THEN
    RAISE EXCEPTION 'a service account cannot administer a project' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION auth.service_account_role_check() FROM PUBLIC;
CREATE TRIGGER project_members_service_role BEFORE INSERT OR UPDATE OF role,principal_id ON app.project_members
  FOR EACH ROW EXECUTE FUNCTION auth.service_account_role_check();

-- What a service account holds in a project beyond its role (reader or editor, in app.project_members): finance,
-- only when granted explicitly, never by default. The names are those of the permission catalog that will replace
-- roles (docs/access/access-and-invitations.md, `granted`); this table then moves into the membership row. Ending
-- the membership ends these grants with it.
CREATE TABLE auth.service_account_grants (
  project_id text NOT NULL,
  principal_id text NOT NULL REFERENCES auth.service_accounts,
  granted text[] NOT NULL CHECK(cardinality(granted) BETWEEN 1 AND 2 AND granted <@ ARRAY['finance.read','finance.write']),
  PRIMARY KEY(project_id,principal_id),
  FOREIGN KEY(project_id,principal_id) REFERENCES app.project_members ON DELETE CASCADE
);

-- Whether a service account may act at all: not deleted, not suspended, and its owner an enabled member of its
-- workspace right now.
CREATE FUNCTION auth.service_account_active(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1 FROM auth.service_accounts s
    JOIN auth.principals a ON a.id=s.principal_id JOIN auth.principals o ON o.id=s.owner_id
    WHERE s.principal_id=target AND s.deleted_at IS NULL AND s.suspended_at IS NULL
      AND a.disabled_at IS NULL AND o.disabled_at IS NULL
      AND EXISTS(SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=s.workspace_id AND w.principal_id=s.owner_id))
$$;
REVOKE ALL ON FUNCTION auth.service_account_active(text) FROM PUBLIC;

-- A service account is not a workspace member, so row security hides its workspace; it may know that one's name.
CREATE FUNCTION auth.service_account_workspace() RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT w.id, w.name FROM auth.service_accounts s JOIN app.workspaces w ON w.id=s.workspace_id
  WHERE s.principal_id=auth.actor_id() AND auth.service_account_active(s.principal_id)
$$;
REVOKE ALL ON FUNCTION auth.service_account_workspace() FROM PUBLIC;

-- Row security learns the service account's ceiling: a project it belongs to is visible only while the account is
-- active and its owner is a member of that project too.
CREATE OR REPLACE FUNCTION auth.can_project(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.project_members WHERE project_id=target AND principal_id=auth.actor_id())
 AND (coalesce(current_setting('app.project_limit',true),'')='' OR current_setting('app.project_limit',true)=target)
 AND NOT EXISTS(
   SELECT 1 FROM auth.service_accounts s WHERE s.principal_id=auth.actor_id()
     AND (NOT auth.service_account_active(s.principal_id)
       OR NOT EXISTS(SELECT 1 FROM app.project_members o WHERE o.project_id=target AND o.principal_id=s.owner_id)))
$$;

-- Finance for a service account: only what was granted explicitly in that project, never above its owner there (the
-- owner reads finance as a member and changes it as an administrator), and only while the account is active (both
-- through can_project). People keep the rules of V20260929000025.
CREATE OR REPLACE FUNCTION auth.service_account_granted(target text, permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM auth.service_account_grants g
    WHERE g.project_id=target AND g.principal_id=auth.actor_id() AND permission=ANY(g.granted))
$$;
REVOKE ALL ON FUNCTION auth.service_account_granted(text,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION auth.can_read_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT auth.can_project(target) AND (
    EXISTS(SELECT 1 FROM auth.principals p WHERE p.id=auth.actor_id() AND p.kind='human' AND p.disabled_at IS NULL)
    OR auth.service_account_granted(target,'finance.read') OR auth.service_account_granted(target,'finance.write'))
$$;
CREATE OR REPLACE FUNCTION auth.can_manage_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT auth.can_read_finance(target) AND (
    EXISTS(SELECT 1 FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id
      WHERE m.project_id=target AND m.principal_id=auth.actor_id() AND m.role='admin' AND p.kind='human')
    OR (auth.service_account_granted(target,'finance.write') AND EXISTS(
      SELECT 1 FROM auth.service_accounts s JOIN app.project_members o ON o.project_id=target AND o.principal_id=s.owner_id
      WHERE s.principal_id=auth.actor_id() AND o.role='admin')))
$$;

-- A client registered itself (RFC 7591). Its name and addresses are what the client declared; nothing is fetched.
CREATE TABLE auth.oauth_clients (
  id text PRIMARY KEY CHECK(id ~ '^cl_[A-Za-z0-9_-]{43}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  redirect_uris text[] NOT NULL CHECK(cardinality(redirect_uris) BETWEEN 1 AND 5),
  grant_types text[] NOT NULL CHECK(grant_types <@ ARRAY['authorization_code','refresh_token'] AND 'authorization_code'=ANY(grant_types)),
  auth_method text NOT NULL CHECK(auth_method IN ('none','client_secret_post','client_secret_basic')),
  secret_hash text CHECK(secret_hash IS NULL OR length(secret_hash)=64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((auth_method='none')=(secret_hash IS NULL))
);
CREATE INDEX oauth_clients_created ON auth.oauth_clients(created_at);

-- A connected app: one approval of one client, given by a person for one of their service accounts (the principal),
-- with the scopes and the resource approved. Revoking it revokes its access and refresh tokens in the same transaction.
CREATE TABLE auth.oauth_grants (
  id uuid PRIMARY KEY,
  client_id text NOT NULL REFERENCES auth.oauth_clients,
  principal_id text NOT NULL REFERENCES auth.principals,
  granted_by text NOT NULL REFERENCES auth.principals,
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 2 AND scopes <@ ARRAY['read','write']),
  resource text NOT NULL CHECK(length(resource) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
CREATE INDEX oauth_grants_principal ON auth.oauth_grants(principal_id,created_at DESC);
CREATE INDEX oauth_grants_granted_by ON auth.oauth_grants(granted_by);
CREATE INDEX oauth_grants_client ON auth.oauth_grants(client_id);

-- An authorization code: five minutes, once, for this client, address, PKCE challenge (S256), scopes, resource and
-- service account. A replayed code finds its grant and revokes it.
CREATE TABLE auth.oauth_codes (
  code_hash text PRIMARY KEY CHECK(length(code_hash)=64),
  client_id text NOT NULL REFERENCES auth.oauth_clients,
  principal_id text NOT NULL REFERENCES auth.principals,
  granted_by text NOT NULL REFERENCES auth.principals,
  redirect_uri text NOT NULL CHECK(length(redirect_uri) BETWEEN 1 AND 2000),
  code_challenge text NOT NULL CHECK(code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 2 AND scopes <@ ARRAY['read','write']),
  resource text NOT NULL CHECK(length(resource) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  grant_id uuid REFERENCES auth.oauth_grants
);
CREATE INDEX oauth_codes_expiry ON auth.oauth_codes(expires_at);
CREATE INDEX oauth_codes_client ON auth.oauth_codes(client_id);

-- Refresh tokens rotate on every use. Each remembers the token it was issued for (its parent) and the access token
-- issued with it, so a replay can be told from a lost response or from two refreshes racing (see OAuthTokens).
-- A superseded token lost such a race: its sibling was used first.
CREATE TABLE auth.oauth_refresh_tokens (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
  grant_id uuid NOT NULL REFERENCES auth.oauth_grants,
  parent_hash text CHECK(parent_hash IS NULL OR length(parent_hash)=64),
  access_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  replaced_by text CHECK(replaced_by IS NULL OR length(replaced_by)=64),
  superseded_at timestamptz,
  revoked_at timestamptz,
  CHECK((rotated_at IS NULL)=(replaced_by IS NULL))
);
CREATE INDEX oauth_refresh_grant ON auth.oauth_refresh_tokens(grant_id);
CREATE INDEX oauth_refresh_parent ON auth.oauth_refresh_tokens(parent_hash) WHERE parent_hash IS NOT NULL;

-- Two more kinds of credential, both a service account's: `service` tokens made in settings for scripts and `oauth`
-- access tokens. The initiator is the person who made the token or approved the app.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='auth.credentials'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''session''%''agent''%'
    AND pg_get_constraintdef(oid) NOT LIKE '%csrf%';
  EXECUTE format('ALTER TABLE auth.credentials DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE auth.credentials ADD CONSTRAINT credential_kind CHECK(kind IN ('session','agent','service','oauth'));
ALTER TABLE auth.credentials
  ADD COLUMN name text CHECK(name IS NULL OR length(name) BETWEEN 1 AND 100),
  ADD COLUMN scopes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN audience text CHECK(audience IS NULL OR length(audience) BETWEEN 1 AND 300),
  ADD COLUMN grant_id uuid REFERENCES auth.oauth_grants,
  ADD COLUMN created_at timestamptz,
  ADD COLUMN last_used_at timestamptz;
-- Rows made before this migration keep an unknown creation time rather than a made-up one.
ALTER TABLE auth.credentials ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE auth.credentials ADD CONSTRAINT credential_delegation CHECK(
  (kind IN ('service','oauth')) = (audience IS NOT NULL AND initiator_id<>principal_id AND project_id IS NULL
    AND cardinality(scopes) BETWEEN 1 AND 2 AND scopes <@ ARRAY['read','write'])
  AND (kind='oauth')=(grant_id IS NOT NULL)
  AND (kind='service')=(name IS NOT NULL)
);
CREATE INDEX credentials_grant ON auth.credentials(grant_id) WHERE grant_id IS NOT NULL;
CREATE INDEX credentials_oauth_expiry ON auth.credentials(expires_at) WHERE kind='oauth';

-- Access tokens are issued on every refresh; once expired for a day they are dead weight. The runtime role may not
-- delete credentials, so this narrow function collects a bounded batch of expired OAuth access tokens only.
CREATE FUNCTION auth.collect_oauth_access_tokens(batch integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate text; collected integer := 0;
BEGIN
  FOR candidate IN
    SELECT id FROM auth.credentials WHERE kind='oauth' AND expires_at < clock_timestamp() - interval '1 day'
    ORDER BY expires_at LIMIT least(greatest(batch,0),1000)
  LOOP
    BEGIN
      DELETE FROM auth.credentials WHERE id=candidate;
      collected := collected + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Still referenced (a planning selection made with it): kept as long as the reference.
      NULL;
    END;
  END LOOP;
  RETURN collected;
END $$;
REVOKE ALL ON FUNCTION auth.collect_oauth_access_tokens(integer) FROM PUBLIC;
CREATE INDEX credentials_service ON auth.credentials(principal_id) WHERE kind='service';

-- The access history of service accounts: accounts made, changed, suspended and deleted, tokens made and revoked,
-- apps connected and disconnected, replays detected; the principal is the service account, the actor who did it (none
-- for what the server detected). Names and identifiers only, never a secret.
CREATE TABLE auth.access_events (
  id uuid PRIMARY KEY,
  principal_id text NOT NULL REFERENCES auth.principals,
  actor_id text REFERENCES auth.principals,
  action text NOT NULL CHECK(action IN ('account.created','account.changed','account.owner-changed',
    'account.suspended','account.deleted','project.granted','project.revoked','token.created','token.revoked',
    'app.connected','app.revoked','app.code-replayed','app.refresh-replayed')),
  subject_id text NOT NULL CHECK(length(subject_id) BETWEEN 1 AND 200),
  client_id text CHECK(client_id IS NULL OR length(client_id)<=100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX access_events_principal ON auth.access_events(principal_id,created_at DESC);

-- Who changed project data, and through which kind of credential and which app.
ALTER TABLE app.audit_events ADD COLUMN credential_kind text
  CHECK(credential_kind IS NULL OR credential_kind IN ('session','agent','service','oauth'));
ALTER TABLE app.audit_events ADD COLUMN client_id text CHECK(client_id IS NULL OR length(client_id)<=100);
