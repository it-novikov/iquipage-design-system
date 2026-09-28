-- One person, several ways in. An identity is a verified way to sign in — an e-mail code, Google, Apple — bound to
-- one principal. A principal's e-mail is its verified contact address; a new way in with the same verified address
-- joins that principal instead of creating another.
CREATE TABLE auth.identities (
  issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 200),
  subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 320),
  principal_id text NOT NULL REFERENCES auth.principals,
  email text CHECK(email IS NULL OR (length(email) BETWEEN 3 AND 320 AND position('@' in email)>1)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(issuer,subject)
);
CREATE INDEX identities_principal ON auth.identities(principal_id);
INSERT INTO auth.identities(issuer,subject,principal_id,email)
  SELECT issuer,subject,id,email FROM auth.principals WHERE kind='human' AND issuer IS NOT NULL AND subject IS NOT NULL;
-- New people get their identity only in auth.identities; issuer and subject on the principal stay for the ones
-- created before.
ALTER TABLE auth.principals DROP CONSTRAINT principals_check;
ALTER TABLE auth.principals ADD CONSTRAINT principals_agent_has_no_identity
  CHECK(kind='human' OR (issuer IS NULL AND subject IS NULL));
CREATE INDEX principals_email ON auth.principals(lower(email)) WHERE kind='human' AND email IS NOT NULL;

-- A sign-in code sent by e-mail. The browser that asked keeps the challenge token in a cookie; only hashes are
-- stored, and the code hash includes the token, so the table alone does not reveal or verify a code.
CREATE TABLE auth.email_challenges (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
  email text NOT NULL CHECK(length(email) BETWEEN 3 AND 320 AND position('@' in email)>1),
  code_hash text NOT NULL CHECK(length(code_hash)=64),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX email_challenges_email ON auth.email_challenges(email,created_at);
CREATE INDEX email_challenges_expiry ON auth.email_challenges(expires_at);

-- A pending browser sign-in now names its provider; the callback of one provider cannot finish another's attempt.
DELETE FROM auth.login_states;
ALTER TABLE auth.login_states ADD COLUMN provider text NOT NULL CHECK(provider IN ('google','apple'));
