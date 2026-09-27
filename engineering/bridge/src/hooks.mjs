import {appendJournal} from './journal.mjs';
import {bridgeCommand, handoff, release} from './operations.mjs';
import {briefFor} from './prompt.mjs';
import {TASK_ID, listTaskIds, loadCard, requireInitialized, withLock} from './store.mjs';

// Claude Code StopFailure error types and what they mean for the task.
const LIMIT = new Set(['rate_limit', 'billing_error', 'account_on_hold']);
const AUTH = new Set(['authentication_failed', 'oauth_org_not_allowed', 'cloud_credential_error']);

function heldTasks(root, agent) {
  return listTaskIds(root).map(id => ({id, meta: loadCard(root, id).meta})).filter(task => task.meta.holder === agent);
}

/**
 * Handles one Claude Code hook call. Returns text for stdout (SessionStart adds it to the model's context).
 * A hook must never break the session, so the caller swallows every error.
 */
export function handleClaudeHook(root, input, {agent = process.env.BRIDGE_AGENT || 'claude-code'} = {}) {
  try { requireInitialized(root); } catch { return ''; }
  const event = input.hook_event_name;
  const pinned = process.env.BRIDGE_TASK && TASK_ID.test(process.env.BRIDGE_TASK) ? process.env.BRIDGE_TASK : null;
  const held = pinned ? heldTasks(root, agent).filter(task => task.id === pinned) : heldTasks(root, agent);
  const command = bridgeCommand(root);

  if (event === 'SessionStart') {
    if (held.length === 1 && ['compact', 'resume'].includes(input.source)) {
      // After compaction the model lost the details; the card has them in a fraction of the tokens.
      return `Контекст восстановлен из моста. Продолжайте задачу по карточке.\n\n${briefFor(root, held[0].id, {budget: 6000})}`;
    }
    if (held.length) return `Мост: вы держите ${held.map(task => task.id).join(', ')}. Сводка: ${command} brief ${held[0].id}\n`;
    const active = listTaskIds(root).map(id => ({id, meta: loadCard(root, id).meta})).filter(task => ['active', 'ready', 'blocked'].includes(task.meta.status));
    if (!active.length) return '';
    return `Мост: открытые задачи — ${active.slice(0, 5).map(task => `${task.id} (${task.meta.status}${task.meta.holder ? `, ${task.meta.holder}` : ''})`).join('; ')}. Перед работой над ними: ${command} brief <id>\n`;
  }
  if (!held.length) return '';

  for (const task of held) {
    if (event === 'StopFailure') {
      const type = input.error_type || 'unknown';
      if (LIMIT.has(type) || AUTH.has(type)) {
        handoff(root, task.id, {agent, reason: LIMIT.has(type) ? 'limit' : 'auth', note: `Claude Code: ${type}`});
      } else {
        withLock(root, task.id, () => appendJournal(root, task.id, {actor: agent, kind: 'trigger', text: `Claude Code: ${type}; задача остаётся за агентом`}));
      }
    } else if (event === 'PreCompact') {
      withLock(root, task.id, () => appendJournal(root, task.id, {actor: agent, kind: 'note', text: `контекст сжимается (${input.trigger || input.matcher || 'auto'}); карточка — источник правды`}));
    } else if (event === 'SessionEnd') {
      release(root, task.id, {agent, note: `сессия завершена (${input.reason || 'other'})`});
    }
  }
  return '';
}
