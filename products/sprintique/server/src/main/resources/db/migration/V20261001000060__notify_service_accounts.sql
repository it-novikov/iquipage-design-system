-- Service accounts receive notifications and keep them as an inbox (docs/decisions/0008-mentions-and-service-inbox.md).
-- A service account is mentioned, assigned, asked or reminded of a due date like a person, and reads what it missed
-- through MCP or the API when it comes back to work. Raising itself (app.raise_notification) is unchanged: it asks
-- app.notification_recipient, which now admits an active service account. External channels stay people's only:
-- Telegram links a chat to a person alone (app.telegram_link_chat), so a service account never has one.

-- Whether a principal may receive a notification about a project now: a member with the right to read its tasks that
-- is an enabled person, or a service account that may act (not suspended or deleted, its owner enabled and in its
-- workspace) and whose owner is a member of the project too, exactly the ceiling row security applies to it
-- (auth.can_project). Agents never receive. Memberships carry no row security.
CREATE OR REPLACE FUNCTION app.notification_recipient(target_project text,person text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM auth.principals p JOIN app.project_members m ON m.principal_id=p.id
    WHERE p.id=person AND p.disabled_at IS NULL AND m.project_id=target_project AND 'tasks.read'=ANY(m.permissions)
      AND (p.kind='human' OR (p.kind='service' AND auth.service_account_active(p.id) AND EXISTS(
        SELECT 1 FROM auth.service_accounts s JOIN app.project_members o ON o.project_id=target_project AND o.principal_id=s.owner_id
        WHERE s.principal_id=p.id))))
$$;

-- Deadlines as in V…044, now also for a service account that owns a task: in its project's time zone (it has no
-- Workbench of its own).
CREATE OR REPLACE FUNCTION work.raise_due_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record;task record;zone text;local timestamp;raised integer:=0;
BEGIN
  FOR member IN SELECT m.project_id,m.principal_id FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id
      WHERE p.kind IN ('human','service') AND p.disabled_at IS NULL AND 'tasks.read'=ANY(m.permissions)
        AND app.notification_recipient(m.project_id,m.principal_id)
      ORDER BY m.project_id,m.principal_id LOOP
    PERFORM work.act_as(member.principal_id);
    zone:=coalesce((SELECT w.timezone FROM app.workbench_preferences w WHERE w.principal_id=member.principal_id),
      auth.project_timezone(member.project_id),'UTC');
    BEGIN
      local:=clock_timestamp() AT TIME ZONE zone;
    EXCEPTION WHEN invalid_parameter_value THEN
      local:=clock_timestamp() AT TIME ZONE 'UTC';
    END;
    FOR task IN SELECT t.id,t.due FROM app.tasks t
        WHERE t.project_id=member.project_id AND t.owner_id=member.principal_id AND t.due BETWEEN local::date AND local::date+1
          AND t.status<>'ready_for_release' AND t.result<>'accepted' LOOP
      IF local>=(task.due-1)+time '09:00' AND app.raise_notification(member.principal_id,member.project_id,task.id,'deadline',NULL,
          jsonb_build_object('due',task.due,'on',local::date),'deadline:'||member.project_id||':'||task.id||':'||task.due) IS NOT NULL THEN
        raised:=raised+1;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM work.act_as(NULL);
  RETURN raised;
END $$;

-- The inbox reads unread items oldest first.
CREATE INDEX notifications_inbox ON app.notifications(recipient_id,created_at,id) WHERE read_at IS NULL;

-- The backlog of service accounts for the people who manage them (settings → «Сервисные аккаунты»): only the number of
-- unread notifications the account itself could read now, and only for an account the caller owns or whose workspace
-- they administer (workspace.people). Any other id answers nothing: neither the count nor that the account exists.
CREATE FUNCTION auth.service_account_unread(accounts text[]) RETURNS TABLE(principal_id text, unread integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.principal_id,
         (SELECT count(*)::int FROM app.notifications n
          WHERE n.recipient_id=s.principal_id AND n.read_at IS NULL AND app.notification_recipient(n.project_id,s.principal_id))
  FROM auth.service_accounts s
  WHERE s.principal_id=ANY(accounts[1:200]) AND s.deleted_at IS NULL AND auth.actor_id() IS NOT NULL
    AND (s.owner_id=auth.actor_id() OR EXISTS(SELECT 1 FROM app.workspace_members w
      WHERE w.workspace_id=s.workspace_id AND w.principal_id=auth.actor_id() AND 'workspace.people'=ANY(w.permissions)))
$$;
REVOKE ALL ON FUNCTION auth.service_account_unread(text[]) FROM PUBLIC;
