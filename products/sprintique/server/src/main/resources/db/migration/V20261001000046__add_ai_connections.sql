-- AI connections and agent profiles (docs/decisions/0005-ai-agents.md). A workspace keeps connections to language
-- model providers: Anthropic (Claude), OpenAI (ChatGPT) or any OpenAI-compatible endpoint (OpenRouter, DeepSeek, a
-- local vLLM or Ollama). People with «Настраивать пространство» manage them. The API key is written once and never
-- read back: the server seals it with AES-256-GCM under a key from its environment (SPRINTIQUE_SECRETS_KEY) and keeps
-- only the sealed bytes, the key version and the last four characters to recognise it.

-- The table owner sees every row through these policies, so the narrow SECURITY DEFINER functions below (and the
-- agent runner's queue functions of V20261001000047) work across tenants; the runtime role keeps tenant row security.
CREATE FUNCTION app.ai_is_owner(target regclass) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=target))
$$;

CREATE TABLE app.ai_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES app.workspaces,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  provider text NOT NULL CHECK(provider IN ('anthropic','openai','openai_compatible')),
  base_url text NOT NULL CHECK(length(base_url) BETWEEN 10 AND 500 AND base_url ~ '^https?://[^/?#@[:space:]]+(/[^?#[:space:]]*)?$'),
  default_model text CHECK(default_model IS NULL OR length(default_model) BETWEEN 1 AND 200),
  -- The last four characters of the key, to tell keys apart; the rest is never stored in the clear.
  key_hint text NOT NULL CHECK(length(key_hint) BETWEEN 1 AND 4),
  -- Model names the provider listed at the last successful check, offered as suggestions.
  models text[] NOT NULL DEFAULT '{}' CHECK(cardinality(models)<=200),
  last_test_state text CHECK(last_test_state IN ('connected','failed')),
  last_test_code text CHECK(last_test_code IS NULL OR last_test_code ~ '^[A-Z_]{2,40}$'),
  last_tested_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by text NOT NULL REFERENCES auth.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL REFERENCES auth.principals,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE(workspace_id,id),
  CHECK((last_test_state IS NULL)=(last_tested_at IS NULL))
);
CREATE INDEX ai_connections_workspace ON app.ai_connections(workspace_id,name) WHERE deleted_at IS NULL;
ALTER TABLE app.ai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_connections FORCE ROW LEVEL SECURITY;
-- Members of the workspace see that a connection exists (its name, provider and model, never its key); changes are
-- for «Настраивать пространство».
CREATE POLICY ai_connections_read ON app.ai_connections FOR SELECT
  USING(auth.can_workspace(workspace_id) OR app.ai_is_owner('app.ai_connections'));
CREATE POLICY ai_connections_insert ON app.ai_connections FOR INSERT
  WITH CHECK(auth.can_workspace_do(workspace_id,'workspace.settings') AND created_by=auth.actor_id() AND updated_by=auth.actor_id());
CREATE POLICY ai_connections_update ON app.ai_connections FOR UPDATE
  USING(auth.can_workspace_do(workspace_id,'workspace.settings') OR app.ai_is_owner('app.ai_connections'))
  WITH CHECK(auth.can_workspace_do(workspace_id,'workspace.settings') OR app.ai_is_owner('app.ai_connections'));

-- The sealed key: nonce, ciphertext and tag of AES-256-GCM, bound to the connection and the key version. The runtime
-- role has no policy here at all; only the functions below, which check the caller, touch it.
CREATE TABLE app.ai_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES app.ai_connections,
  sealed bytea NOT NULL CHECK(octet_length(sealed) BETWEEN 29 AND 8300),
  key_version integer NOT NULL CHECK(key_version BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app.ai_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_connection_secrets FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_connection_secrets_owner ON app.ai_connection_secrets
  USING(app.ai_is_owner('app.ai_connection_secrets')) WITH CHECK(app.ai_is_owner('app.ai_connection_secrets'));

-- Writes a new sealed key for a live connection of a workspace the caller configures.
CREATE FUNCTION app.ai_store_connection_secret(target uuid, value bytea, version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.ai_connections c WHERE c.id=target AND c.deleted_at IS NULL
      AND auth.can_workspace_do(c.workspace_id,'workspace.settings')) THEN
    RAISE EXCEPTION 'connection not available' USING ERRCODE='42501';
  END IF;
  INSERT INTO app.ai_connection_secrets(connection_id,sealed,key_version) VALUES(target,value,version)
  ON CONFLICT (connection_id) DO UPDATE SET sealed=excluded.sealed,key_version=excluded.key_version,updated_at=clock_timestamp();
END $$;

-- The sealed key of a live connection, for the person who configures the workspace (the «Проверить» call).
CREATE FUNCTION app.ai_connection_secret(target uuid) RETURNS TABLE(sealed bytea, key_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.sealed, s.key_version FROM app.ai_connection_secrets s JOIN app.ai_connections c ON c.id=s.connection_id
  WHERE s.connection_id=target AND c.deleted_at IS NULL AND auth.can_workspace_do(c.workspace_id,'workspace.settings')
$$;

-- Forgets the key of a connection being deleted: nothing sealed outlives its connection.
CREATE FUNCTION app.ai_forget_connection_secret(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.ai_connections c WHERE c.id=target
      AND auth.can_workspace_do(c.workspace_id,'workspace.settings')) THEN
    RAISE EXCEPTION 'connection not available' USING ERRCODE='42501';
  END IF;
  DELETE FROM app.ai_connection_secrets WHERE connection_id=target;
END $$;
REVOKE ALL ON FUNCTION app.ai_is_owner(regclass),app.ai_store_connection_secret(uuid,bytea,integer),
  app.ai_connection_secret(uuid),app.ai_forget_connection_secret(uuid) FROM PUBLIC;

-- The agent of a service account: which connection and model it thinks with, the instructions of its owner, when it
-- starts (a task assigned to it; a person may always start it by hand on a task) and its limits. It acts with the
-- account's own rights and nothing else.
CREATE TABLE app.ai_agent_profiles (
  principal_id text PRIMARY KEY REFERENCES auth.service_accounts,
  workspace_id uuid NOT NULL REFERENCES app.workspaces,
  connection_id uuid,
  enabled boolean NOT NULL DEFAULT false,
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=8000),
  on_assignment boolean NOT NULL DEFAULT true,
  max_steps integer NOT NULL DEFAULT 12 CHECK(max_steps BETWEEN 1 AND 50),
  max_output_tokens integer NOT NULL DEFAULT 2048 CHECK(max_output_tokens BETWEEN 256 AND 32000),
  runs_per_hour integer NOT NULL DEFAULT 20 CHECK(runs_per_hour BETWEEN 1 AND 200),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_by text NOT NULL REFERENCES auth.principals,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES app.ai_connections(workspace_id,id),
  CHECK(NOT enabled OR connection_id IS NOT NULL)
);
CREATE INDEX ai_agent_profiles_connection ON app.ai_agent_profiles(connection_id) WHERE connection_id IS NOT NULL;
ALTER TABLE app.ai_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_agent_profiles FORCE ROW LEVEL SECURITY;
-- Who manages the account (its owner, a workspace administrator) is decided by the application; row security keeps
-- the profile inside its workspace.
CREATE POLICY ai_agent_profiles_workspace ON app.ai_agent_profiles
  USING(auth.can_workspace(workspace_id) OR app.ai_is_owner('app.ai_agent_profiles'))
  WITH CHECK(auth.can_workspace(workspace_id) OR app.ai_is_owner('app.ai_agent_profiles'));
