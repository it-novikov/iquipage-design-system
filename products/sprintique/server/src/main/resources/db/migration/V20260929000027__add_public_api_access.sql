-- Delegated access for people (docs/decisions/0003-public-api-mcp.md): personal access tokens for scripts and
-- OAuth 2.1 for MCP clients. A delegated credential acts exactly as its person, narrowed by its scopes and bound to
-- one resource. Every secret is 256 random bits; only its SHA-256 is stored. Like auth.credentials these tables are
-- read before an access context exists, so the runtime role's grants protect them, not row security.

-- A client registered itself (RFC 7591). Its name and addresses are what the client declared; nothing is fetched.
CREATE TABLE auth.oauth_clients (
  id text PRIMARY KEY CHECK(id ~ '^cl_[A-Za-z0-9_-]{43}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  redirect_uris text[] NOT NULL CHECK(cardinality(redirect_uris) BETWEEN 1 AND 10),
  grant_types text[] NOT NULL CHECK(grant_types <@ ARRAY['authorization_code','refresh_token'] AND 'authorization_code'=ANY(grant_types)),
  auth_method text NOT NULL CHECK(auth_method IN ('none','client_secret_post','client_secret_basic')),
  secret_hash text CHECK(secret_hash IS NULL OR length(secret_hash)=64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((auth_method='none')=(secret_hash IS NULL))
);
CREATE INDEX oauth_clients_created ON auth.oauth_clients(created_at);

-- A connected app: one approval of one client by one person, with the scopes and the resource approved. Revoking it
-- revokes its access and refresh tokens in the same transaction.
CREATE TABLE auth.oauth_grants (
  id uuid PRIMARY KEY,
  client_id text NOT NULL REFERENCES auth.oauth_clients,
  principal_id text NOT NULL REFERENCES auth.principals,
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 2 AND scopes <@ ARRAY['read','write']),
  resource text NOT NULL CHECK(length(resource) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
CREATE INDEX oauth_grants_principal ON auth.oauth_grants(principal_id,created_at DESC);
CREATE INDEX oauth_grants_client ON auth.oauth_grants(client_id);

-- An authorization code: five minutes, once, for this client, address, PKCE challenge (S256), scopes and resource.
-- A replayed code finds its grant and revokes it.
CREATE TABLE auth.oauth_codes (
  code_hash text PRIMARY KEY CHECK(length(code_hash)=64),
  client_id text NOT NULL REFERENCES auth.oauth_clients,
  principal_id text NOT NULL REFERENCES auth.principals,
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

-- Refresh tokens rotate on every use. A rotated token remembers its successor, so a replay can be told from a lost
-- response (see OAuthTokens).
CREATE TABLE auth.oauth_refresh_tokens (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
  grant_id uuid NOT NULL REFERENCES auth.oauth_grants,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  replaced_by text CHECK(replaced_by IS NULL OR length(replaced_by)=64),
  revoked_at timestamptz,
  CHECK((rotated_at IS NULL)=(replaced_by IS NULL))
);
CREATE INDEX oauth_refresh_grant ON auth.oauth_refresh_tokens(grant_id);

-- Two more kinds of credential, both a person's own: `personal` tokens made in settings and `oauth` access tokens.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='auth.credentials'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''session''%''agent''%'
    AND pg_get_constraintdef(oid) NOT LIKE '%csrf%';
  EXECUTE format('ALTER TABLE auth.credentials DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE auth.credentials ADD CONSTRAINT credential_kind CHECK(kind IN ('session','agent','personal','oauth'));
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
  (kind IN ('personal','oauth')) = (audience IS NOT NULL AND initiator_id=principal_id AND project_id IS NULL
    AND cardinality(scopes) BETWEEN 1 AND 2 AND scopes <@ ARRAY['read','write'])
  AND (kind='oauth')=(grant_id IS NOT NULL)
  AND (kind='personal')=(name IS NOT NULL)
);
CREATE INDEX credentials_grant ON auth.credentials(grant_id) WHERE grant_id IS NOT NULL;
CREATE INDEX credentials_personal ON auth.credentials(principal_id) WHERE kind='personal';

-- Account-level access history: tokens made and revoked, apps connected and disconnected, replays detected. Names and
-- identifiers only, never a secret.
CREATE TABLE auth.access_events (
  id uuid PRIMARY KEY,
  principal_id text NOT NULL REFERENCES auth.principals,
  action text NOT NULL CHECK(action IN ('token.created','token.revoked','app.connected','app.revoked',
    'app.code-replayed','app.refresh-replayed')),
  subject_id text NOT NULL CHECK(length(subject_id) BETWEEN 1 AND 100),
  client_id text CHECK(client_id IS NULL OR length(client_id)<=100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX access_events_principal ON auth.access_events(principal_id,created_at DESC);

-- Who changed project data, and through which kind of credential and which app.
ALTER TABLE app.audit_events ADD COLUMN credential_kind text
  CHECK(credential_kind IS NULL OR credential_kind IN ('session','agent','personal','oauth'));
ALTER TABLE app.audit_events ADD COLUMN client_id text CHECK(client_id IS NULL OR length(client_id)<=100);
