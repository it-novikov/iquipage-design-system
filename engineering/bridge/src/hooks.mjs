import {spawn} from 'node:child_process';
import {appendFileSync, mkdirSync, openSync} from 'node:fs';
import {join} from 'node:path';
import {appendJournal, readJournal} from './journal.mjs';
import {liveLease, readLease} from './lease.mjs';
import {BRIDGE_HOME, bridgeCommand, handoff, release} from './operations.mjs';
import {briefFor} from './prompt.mjs';
import {parseQuestions} from './card.mjs';
import {TASK_ID, isoSeconds, loadConfig, now, paths, readCards, requireInitialized, withLock} from './store.mjs';

// Claude Code StopFailure error types and what they mean for the task.
const LIMIT = new Set(['rate_limit', 'billing_error', 'account_on_hold']);
const AUTH = new Set(['authentication_failed', 'oauth_org_not_allowed', 'cloud_credential_error']);
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_AGENT = 'claude-code';

/**
 * The tasks this Claude Code session holds. An interactive session is identified by its session id, which the
 * SessionStart hook exported as BRIDGE_SESSION and `bridge claim` stored in the lease. A session started by the
 * relay is identified by the task and agent name the relay gave it.
 */
function tasksOfSession(root, input) {
  const session = SESSION_ID.test(input.session_id ?? '') ? input.session_id : '';
  const pinned = process.env.BRIDGE_TASK && TASK_ID.test(process.env.BRIDGE_TASK) ? process.env.BRIDGE_TASK : null;
  const agent = process.env.BRIDGE_AGENT || DEFAULT_AGENT;
  return readCards(root, {warn: false}).map(entry => ({id: entry.id, card: entry.card, lease: liveLease(root, entry.id)}))
    .filter(({id, lease}) => lease && (session && lease.session === session || !lease.session && pinned === id && lease.holder === agent));
}

/** Open questions older than a day: the owner is the bottleneck, so the next session names them. */
export function waitingQuestions(root, cards) {
  const day = 24 * 3600_000;
  return cards.flatMap(({id, card}) => {
    const asked = new Map(readJournal(root, id).filter(entry => entry.kind === 'question').map(entry => [entry.ref, entry.at]));
    return parseQuestions(card).filter(question => question.status === 'open' && asked.has(question.id) && now() - new Date(asked.get(question.id)) > day)
      .map(question => `${id}/${question.id}`);
  });
}

/**
 * Handles one Claude Code hook call and returns text for stdout (SessionStart adds it to the model's context).
 * A hook must never break the session, so the caller swallows every error.
 */
export function handleClaudeHook(root, input, {spawnRelay = spawnDetachedRelay} = {}) {
  try { requireInitialized(root); } catch { return ''; }
  const event = input.hook_event_name;
  const relay = process.env.BRIDGE_RELAY === '1';
  const agent = process.env.BRIDGE_AGENT || DEFAULT_AGENT;
  const command = bridgeCommand(root);

  if (event === 'SessionStart') {
    // Later Bash commands of this session identify themselves to the bridge through these variables.
    if (process.env.CLAUDE_ENV_FILE && SESSION_ID.test(input.session_id ?? '')) {
      const lines = [`export BRIDGE_SESSION=${input.session_id}`];
      if (!process.env.BRIDGE_AGENT) lines.push(`export BRIDGE_AGENT=${DEFAULT_AGENT}`);
      appendFileSync(process.env.CLAUDE_ENV_FILE, `${lines.join('\n')}\n`);
    }
    const held = tasksOfSession(root, input);
    if (held.length === 1 && ['compact', 'clear'].includes(input.source)) {
      // After compaction the model lost the details; the card has them in a fraction of the tokens.
      return `Контекст восстановлен из моста. Продолжайте задачу по карточке.\n\n${briefFor(root, held[0].id, {budget: 6000})}`;
    }
    if (held.length) return `Мост: эта сессия держит ${held.map(task => task.id).join(', ')}. Сводка: ${command} brief ${held[0].id}\n`;
    if (relay) return '';
    const cards = readCards(root, {warn: false});
    const open = cards.filter(entry => ['active', 'ready', 'blocked'].includes(entry.card.meta.status));
    if (!open.length) return '';
    const describe = entry => {
      const lease = liveLease(root, entry.id);
      return `${entry.id} (${entry.card.meta.status}${lease ? `, держит ${lease.holder}` : ''})`;
    };
    const waiting = waitingQuestions(root, cards);
    return `Мост: открытые задачи — ${open.slice(0, 5).map(describe).join('; ')}. Перед работой: ${command} brief <id>, затем claim.`
      + `${waiting.length ? ` Больше суток ждут ответа владельца: ${waiting.slice(0, 5).join(', ')}.` : ''}\n`;
  }

  for (const task of tasksOfSession(root, input)) {
    if (event === 'StopFailure') {
      const type = input.error_type || 'unknown';
      if (!relay && (LIMIT.has(type) || AUTH.has(type))) {
        const holder = readLease(root, task.id)?.holder ?? agent;
        handoff(root, task.id, {agent: holder, reason: LIMIT.has(type) ? 'limit' : 'auth', note: `Claude Code: ${type}`});
        if (loadConfig(root).relay?.fromHooks) spawnRelay(root, task.id, holder);
      } else {
        // Transient errors, and every error inside the relay, which classifies the outcome itself.
        withLock(root, task.id, () => appendJournal(root, task.id, {actor: agent, kind: 'trigger', text: `Claude Code: ${type}; задача остаётся за агентом`}));
      }
    } else if (event === 'PreCompact') {
      withLock(root, task.id, () => appendJournal(root, task.id, {actor: agent, kind: 'note', text: `контекст сжимается (${input.trigger || 'auto'}); карточка — источник правды`}));
    } else if (event === 'SessionEnd' && !relay) {
      release(root, task.id, {agent: readLease(root, task.id)?.holder ?? agent, note: `сессия завершена (${input.reason || 'other'})`, force: true});
    }
  }
  return '';
}

/** Continues the task with the next agent of the chain in a detached relay; its log goes to `.bridge/runs/<id>/`. */
export function spawnDetachedRelay(root, id, afterAgent) {
  const directory = paths(root).run(id);
  mkdirSync(directory, {recursive: true});
  const log = openSync(join(directory, `${isoSeconds(now()).replace(/:/g, '')}-relay.log`), 'a');
  const child = spawn(process.execPath, [join(BRIDGE_HOME, 'bin', 'bridge'), 'run', id, '--after', afterAgent, '--quiet'], {
    cwd: root, detached: true, stdio: ['ignore', log, log], env: {...process.env, BRIDGE_RELAY: '', BRIDGE_SESSION: ''},
  });
  child.unref();
  withLock(root, id, () => appendJournal(root, id, {actor: 'bridge', kind: 'trigger', text: `эстафета запущена после ${afterAgent}, pid ${child.pid}`}));
}
