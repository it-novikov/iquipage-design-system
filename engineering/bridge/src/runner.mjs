import {spawn} from 'node:child_process';
import {createWriteStream, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {BridgeError} from './errors.mjs';
import {gitState} from './git.mjs';
import {appendJournal, readJournal} from './journal.mjs';
import {claim, handoff} from './operations.mjs';
import {authorPrompt} from './prompt.mjs';
import {isoSeconds, loadCard, loadConfig, now, paths} from './store.mjs';

const TAIL_BYTES = 64 * 1024;

/** When a provider says when the limit resets, the relay can come back to that agent instead of giving up on it. */
export function parseRetryAt(text, reference = now()) {
  const relative = /(?:try again|retry|resets?)\s+in\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|h)\b/i.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const seconds = unit.startsWith('h') ? amount * 3600 : unit.startsWith('m') ? amount * 60 : amount;
    return new Date(reference.getTime() + seconds * 1000);
  }
  const header = /retry[- ]after:?\s*(\d+)\b/i.exec(text);
  if (header) return new Date(reference.getTime() + Number(header[1]) * 1000);
  const epoch = /\|(\d{10})\b/.exec(text);
  if (epoch && /limit/i.test(text)) return new Date(Number(epoch[1]) * 1000);
  const clock = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (clock) {
    let hours = Number(clock[1]) % 24;
    const minutes = Number(clock[2] ?? 0);
    if (clock[3]) hours = (hours % 12) + (clock[3].toLowerCase() === 'pm' ? 12 : 0);
    const at = new Date(reference);
    at.setHours(hours, minutes, 0, 0);
    if (at <= reference) at.setDate(at.getDate() + 1);
    return at;
  }
  return null;
}

/**
 * Error patterns are only trusted when the agent process failed: a successful session may well print "rate limit"
 * while working on rate limiting code.
 */
export function classifyOutcome({code, signal, timedOut, tail}, signals = {}) {
  if (timedOut) return {kind: 'timeout', retryAt: null};
  if (code === 0 && !signal) return {kind: 'exited', retryAt: null};
  for (const kind of ['auth', 'limit', 'context', 'overloaded']) {
    const patterns = signals[kind] ?? [];
    if (patterns.some(pattern => new RegExp(pattern, 'i').test(tail))) return {kind, retryAt: kind === 'limit' ? parseRetryAt(tail) : null};
  }
  return {kind: 'crash', retryAt: null};
}

function progressMarker(root, id) {
  const card = loadCard(root, id);
  const git = gitState(root);
  return JSON.stringify({updated: card.meta.updated, journal: readJournal(root, id).length, sha: git?.sha ?? '', dirty: git?.dirty.length ?? 0});
}

function runAgent(root, id, agentKey, agent, prompt, {timeoutMinutes, quiet}) {
  const directory = paths(root).run(id);
  mkdirSync(directory, {recursive: true});
  const logFile = join(directory, `${isoSeconds(now()).replace(/:/g, '')}-${agentKey}.log`);
  const log = createWriteStream(logFile);
  const [command, ...args] = agent.command;
  const child = spawn(command, agent.input === 'argument' ? [...args, prompt] : args, {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    env: {...process.env, ...(agent.env ?? {}), BRIDGE_AGENT: agent.name ?? agentKey, BRIDGE_TASK: id, BRIDGE_ROOT: root},
  });
  let tail = '';
  const collect = (chunk, stream) => {
    log.write(chunk);
    if (!quiet) stream.write(chunk);
    tail = (tail + chunk.toString('utf8')).slice(-TAIL_BYTES);
  };
  child.stdout.on('data', chunk => collect(chunk, process.stdout));
  child.stderr.on('data', chunk => collect(chunk, process.stderr));
  child.stdin.on('error', () => {});
  if (agent.input !== 'argument') child.stdin.end(prompt);
  else child.stdin.end();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10000).unref();
  }, timeoutMinutes * 60_000);
  return new Promise(resolve => {
    child.on('error', error => {
      clearTimeout(timer);
      log.end();
      resolve({code: 127, signal: null, timedOut: false, tail: `${tail}\n${error.message}`, logFile});
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      log.end();
      resolve({code, signal, timedOut, tail, logFile});
    });
  });
}

const REASON = {limit: 'limit', auth: 'auth', context: 'context', timeout: 'timeout', crash: 'error', overloaded: 'error'};

/**
 * The relay: run the first available agent on the task; on a limit, auth failure, crash or timeout record a mechanical
 * handoff and pass the task to the next agent in the chain; retry transient overloads; stop when the task leaves
 * `active`, when every agent is unavailable, or when sessions stop making progress.
 */
export async function runRelay(root, id, {chain: chainOverride, maxRounds, wait = false, dryRun = false, quiet = false, report = text => process.stderr.write(`${text}\n`)}) {
  const config = loadConfig(root);
  const chain = chainOverride?.length ? chainOverride : config.chain ?? [];
  if (!chain.length) throw new BridgeError('CHAIN', 'Цепочка агентов пуста: задайте chain в .bridge/config.json или --chain.');
  for (const key of chain) if (!config.agents?.[key]?.command?.length) throw new BridgeError('AGENT_CONFIG', `Агент ${key} не описан в .bridge/config.json.`);
  const session = {timeoutMinutes: 120, maxRounds: 8, stallRounds: 2, ...(config.session ?? {})};
  const rounds = maxRounds ?? session.maxRounds;
  const overloadedRetry = {attempts: 2, backoffSeconds: [30, 120], ...(config.retry?.overloaded ?? {})};
  const unavailableUntil = new Map();
  let index = 0, stalled = 0, overloadedAttempts = 0;

  if (dryRun) {
    const agent = config.agents[chain[0]];
    report(`Первый агент: ${chain[0]} → ${agent.command.join(' ')} (${agent.input === 'argument' ? 'промпт аргументом' : 'промпт через stdin'})`);
    return {outcome: 'dry-run', prompt: authorPrompt(root, id, {agent: agent.name ?? chain[0]})};
  }

  for (let round = 1; round <= rounds; round++) {
    const card = loadCard(root, id);
    if (['review', 'done', 'cancelled', 'blocked'].includes(card.meta.status)) {
      report(`Задача в статусе ${card.meta.status}, эстафета остановлена.`);
      return {outcome: card.meta.status};
    }
    const available = chain.map((key, offset) => chain[(index + offset) % chain.length])
      .find(key => !(unavailableUntil.get(key) > now()));
    if (!available) {
      const earliest = [...unavailableUntil.values()].filter(Boolean).sort((a, b) => a - b)[0] ?? null;
      if (wait && earliest) {
        report(`Все агенты недоступны. Ожидание до ${isoSeconds(earliest)}.`);
        await delay(Math.max(0, earliest - now()));
        round--;
        continue;
      }
      appendJournal(root, id, {actor: 'bridge', kind: 'trigger', text: `все агенты недоступны${earliest ? `; ближайшее восстановление ${isoSeconds(earliest)}` : ''}`});
      report(`Все агенты недоступны.${earliest ? ` Повторите после ${isoSeconds(earliest)}: bridge run ${id}` : ''}`);
      return {outcome: 'exhausted', retryAt: earliest};
    }
    index = chain.indexOf(available);
    const agent = config.agents[available];
    const agentName = agent.name ?? available;
    if (card.meta.holder !== agentName) claim(root, id, {agent: agentName, force: Boolean(card.meta.holder && new Date(card.meta.lease) <= now()), reason: 'аренда истекла'});
    const before = progressMarker(root, id);
    report(`Раунд ${round}: ${agentName}`);
    const result = await runAgent(root, id, available, agent, authorPrompt(root, id, {agent: agentName}), {timeoutMinutes: session.timeoutMinutes, quiet});
    const outcome = classifyOutcome(result, agent.signals);
    const after = loadCard(root, id);
    const progressed = progressMarker(root, id) !== before;
    appendJournal(root, id, {actor: 'bridge', kind: 'trigger', text: `${agentName}: ${outcome.kind}, код ${result.code ?? result.signal}${outcome.retryAt ? `, восстановление ${isoSeconds(outcome.retryAt)}` : ''}; лог ${result.logFile.slice(root.length + 1)}`});

    if (outcome.kind === 'exited') {
      // A session end hook may have released the lease (`ready`); any other status is final and reported at the loop head.
      if (!['active', 'ready'].includes(after.meta.status)) continue;
      stalled = progressed ? 0 : stalled + 1;
      if (stalled >= session.stallRounds) {
        handoff(root, id, {agent: agentName, reason: 'planned', note: 'сессии перестали продвигать задачу'});
        report(`Нет продвижения ${stalled} сессии подряд. Нужен человек.`);
        return {outcome: 'stalled'};
      }
      continue; // Same agent, fresh session: the card carries the context.
    }
    if (outcome.kind === 'overloaded' && overloadedAttempts < overloadedRetry.attempts) {
      const seconds = overloadedRetry.backoffSeconds[overloadedAttempts] ?? overloadedRetry.backoffSeconds.at(-1) ?? 60;
      overloadedAttempts++;
      report(`${agentName}: сервис перегружен, повтор через ${seconds} с.`);
      await delay(seconds * 1000);
      continue;
    }
    overloadedAttempts = 0;
    if (outcome.kind === 'context') continue; // A fresh session of the same agent starts from the card.
    const next = chain[(index + 1) % chain.length];
    const nextName = config.agents[next].name ?? next;
    handoff(root, id, {agent: agentName, reason: REASON[outcome.kind], to: next !== available ? nextName : ''});
    const cooldown = outcome.kind === 'limit' || outcome.kind === 'auth' ? outcome.retryAt ?? new Date(now().getTime() + 3600_000) : new Date(now().getTime() + 60_000);
    unavailableUntil.set(available, cooldown);
    index = (index + 1) % chain.length;
  }
  report(`Достигнут предел раундов (${rounds}).`);
  return {outcome: 'max-rounds'};
}
