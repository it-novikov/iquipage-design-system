-- Quick actions from Telegram (docs/decisions/0007-notification-channels.md). A button press or a reply in a private
-- chat acts for the person the chat is linked to, with their current rights, like a signed-in request. The webhook has
-- no session: this function names that person, and the API checks it again before every write.
CREATE FUNCTION app.telegram_chat_person(chat bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT c.principal_id FROM app.telegram_connections c JOIN auth.principals p ON p.id=c.principal_id
  WHERE c.chat_id=chat AND p.kind='human' AND p.disabled_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.telegram_chat_person(bigint) FROM PUBLIC;
