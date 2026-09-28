-- A remembered browser has its own daily limit instead of none, and one device token covers every address the
-- browser signed in to (see EmailSignIn).
ALTER TABLE auth.email_challenges ADD COLUMN from_known_device boolean NOT NULL DEFAULT false;
ALTER TABLE auth.known_devices DROP CONSTRAINT known_devices_pkey;
ALTER TABLE auth.known_devices ADD PRIMARY KEY (token_hash, email);
