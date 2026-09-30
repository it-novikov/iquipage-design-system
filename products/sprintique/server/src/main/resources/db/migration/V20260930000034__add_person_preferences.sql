-- A person's own settings that follow them to every device (Настройки → Профиль); only the person reads and changes
-- them. The first one: whether the board asks before a new task joins a running release, which changes its scope.
CREATE TABLE app.person_preferences (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  confirm_release_scope boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app.person_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY person_preferences_own ON app.person_preferences
  USING(principal_id=auth.actor_id()) WITH CHECK(principal_id=auth.actor_id());
