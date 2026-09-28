-- Sign-in code limits count per requesting client as well as per address: someone asking for codes to another
-- person's address from elsewhere neither cancels that person's codes nor locks them out (see EmailSignIn).
ALTER TABLE auth.email_challenges ADD COLUMN client_hash text CHECK(client_hash IS NULL OR length(client_hash)=64);
CREATE INDEX email_challenges_client ON auth.email_challenges(email,client_hash,created_at);
