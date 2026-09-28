-- A browser that once signed in to an address by a code is remembered for it (a cookie holds the token, the table
-- its hash). Such a browser is not held back by the per-address daily limit that strangers' requests fill up, so
-- nobody can lock a person out of sign-in by asking for codes to their address (see EmailSignIn).
CREATE TABLE auth.known_devices (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
  email text NOT NULL CHECK(length(email) BETWEEN 3 AND 320 AND position('@' in email)>1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX known_devices_expiry ON auth.known_devices(expires_at);
