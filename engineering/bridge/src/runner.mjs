import {spawn} from 'node:child_process';
import {createWriteStream, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {BridgeError} from './errors.mjs';
import {FIELD, fieldText, parseSteps} from './card.mjs';
import {workFingerprint} from './git.mjs';
import {appendJournal, readJournal} from './journal.mjs';
import {describeHolder, liveLease} from './lease.mjs';
import {claim, handoff, release} from './operations.mjs';
import {authorPrompt} from './prompt.mjs';
import {isoSeconds, loadCard, loadConfig, now, paths} from './store.mjs';

const TAIL_LINES = {stderr: 30, stdout: 10};
const CONTENT_KINDS = new Set(['checkpoint', 'step', 'decision', 'question', 'answer', 'status', 'note']);

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

const lastLines = (text, count) => text.split('\n').filter(line => line.trim()).slice(-count).join('\n');

/**
 * Error signals are read only when the agent process failed, and only in the last lines it printed: a working
 * session may well print "401" or "rate limit" from tests of the product it is changing.
 */
export function classifyOutcome({code, signal, timedOut, stderr = '', stdout = '', tail}, signals = {}) {
  if (timedOut) return {kind: 'timeout', retryAt: null};
  if (code === 0 && !signal) return {kind: 'exited', retryAt: null};
  const text = tail ?? `${lastLines(stderr, TAIL_LINES.stderr)}\n${lastLines(stdout, TAIL_LINES.stdout)}`;
  for (const kind of ['limit', 'auth', 'context', 'overloaded']) {
    const patterns = signals[kind] ?? [];
    if (patterns.some(pattern => new RegExp(pattern, 'i').test(text))) return {kind, retryAt: kind === 'limit' ? parseRetryAt(text) : null};
  }
  return {kind: 'crash', retryAt: null};
}

/**
 * Progress is a change in the work or in what the card says: commits, the diff, a new checkpoint text, a finished
 * step. Taking or releasing the lease, the mechanical working-copy snapshot and a repeated identical checkpoint are
 * not progress.
 */
function progressMarker(root, id) {
  const card = readFileSync(paths(root).card(id), 'utf8')
    .replace(/^updated:.*$/m, '')
    .replace(/^- \*\*(Рабочая копия|Причина):\*\*.*$/gm, '');
  const content = new Set(readJournal(root, id).filter(entry => CONTENT_KINDS.has(entry.kind)).map(entry => `${entry.kind} ${entry.ref} ${entry.text}`));
  return JSON.stringify({card, content: [...content].sort(), work: workFingerprint(root)});
}

function runAgent(root, id, agentKey, agent, prompt, {timeoutMinutes, quiet, round}) {
  const directory = paths(root).run(id);
  mkdirSync(directory, {recursive: true});
  const logFile = join(directory, `${isoSeconds(now()).replace(/:/g, '')}-r${round}-${agentKey}.log`);
  const log = createWriteStream(logFile);
  const [command, ...args] = agent.command;
  const child = spawn(command, agent.input === 'argument' ? [...args, prompt] : args, {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    env: {...process.env, ...(agent.env ?? {}), BRIDGE_AGENT: agent.name ?? agentKey, BRIDGE_TASK: id, BRIDGE_ROOT: root, BRIDGE_RELAY: '1', BRIDGE_SESSION: ''},
  });
  const output = {stdout: '', stderr: ''};
  const collect = (chunk, name, stream) => {
    log.write(chunk);
    if (!quiet) stream.write(chunk);
    output[name] = (output[name] + chunk.toString('utf8')).slice(-16384);
  };
  child.stdout.on('data', chunk => collect(chunk, 'stdout', process.stdout));
  child.stderr.on('data', chunk => collect(chunk, 'stderr', process.stderr));
  child.stdin.on('error', () => {});
  child.stdin.end(agent.input === 'argument' ? undefined : prompt);
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
      resolve({code: 127, signal: null, timedOut: false, stdout: output.stdout, stderr: `${output.stderr}\n${error.message}`, logFile});
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      log.end();
      resolve({code, signal, timedOut, ...output, logFile});
    });
  });
}

const REASON = {limit: 'limit', auth: 'auth', context: 'context', timeout: 'timeout', crash: 'error', overloaded: 'error'};

/** The model class the current step asks for: the active step, else the first one still to do. */
function wantedModel(card) {
  const steps = parseSteps(card);
  const step = steps.find(item => item.status === 'active') ?? steps.find(item => item.status === 'todo');
  return step ? fieldText(step.fields[FIELD.model]).trim() : '';
}

/**
 * The relay: run the first available agent on the task; on a limit, auth failure, crash or timeout record a
 * mechanical handoff and pass the task to the next agent of the chain; retry transient overloads; stop when the task
 * leaves `active`/`ready`, when every agent is unavailable, or when sessions stop making progress. A step marked
 * `Модель: fast` goes to the first available agent configured with that model class.
 */
/**
 * The relay holds the task under its own run id. It moves a lease between its agents, takes over the lease of the
 * interactive session that started it, and respects every other holder: another relay, an agent in a terminal.
 */
function takeLease(root, id, agentName, {relayId, ttlHours}) {
  const lease = liveLease(root, id);
  const ownSession = Boolean(lease?.session) && lease.session === process.env.BRIDGE_SESSION;
  if (lease && lease.relay !== relayId && !ownSession) {
    throw new BridgeError('TASK_HELD', `Задачу держит ${describeHolder(lease, agentName)} до ${lease.expires}. Эстафета не отбирает чужую аренду.`, 3);
  }
  if (lease?.holder === agentName && lease.relay === relayId) return;
  if (lease) {
    release(root, id, {agent: lease.holder, note: ownSession ? 'аренду сессии приняла эстафета' : `эстафета передаёт задачу ${agentName}`, force: true});
  }
  claim(root, id, {agent: agentName, ttlHours, session: '', relay: relayId});
}

export async function runRelay(root, id, options = {}) {
  const {chain: chainOverride, maxRounds, wait = false, dryRun = false, quiet = false, after = '', report = text => process.stderr.write(`${text}\n`)} = options;
  const config = loadConfig(root);
  const chain = chainOverride?.length ? chainOverride : config.chain ?? [];
  if (!chain.length) throw new BridgeError('CHAIN', 'Цепочка агентов пуста: задайте chain в .bridge/config.json или --chain.');
  for (const key of chain) if (!config.agents?.[key]?.command?.length) throw new BridgeError('AGENT_CONFIG', `Агент ${key} не описан в .bridge/config.json.`);
  const nameOf = key => config.agents[key].name ?? key;
  const session = {timeoutMinutes: 120, maxRounds: 8, stallRounds: 2, ...(config.session ?? {})};
  const rounds = maxRounds ?? session.maxRounds;
  const overloadedRetry = {attempts: 2, backoffSeconds: [30, 120], ...(config.retry?.overloaded ?? {})};
  const unavailableUntil = new Map();
  const relayId = `r${process.pid}-${Date.now().toString(36)}`;
  let index = 0, stalled = 0, overloadedAttempts = 0;
  if (after) {
    const position = chain.findIndex(key => nameOf(key) === after || key === after);
    if (position >= 0) {
      unavailableUntil.set(chain[position], new Date(now().getTime() + 3600_000));
      index = (position + 1) % chain.length;
    }
  }

  // The chain order is the preference; an agent that failed is skipped while it is unavailable. A step that asks for a
  // model class goes to the first available agent of that class; any other step avoids agents marked `fast`.
  const pick = card => {
    const available = chain.slice(index).concat(chain.slice(0, index)).filter(key => !(unavailableUntil.get(key) > now()));
    const model = wantedModel(card);
    if (model) return available.find(key => config.agents[key].model === model) ?? available[0];
    return available.find(key => config.agents[key].model !== 'fast') ?? available[0];
  };

  if (dryRun) {
    const key = pick(loadCard(root, id));
    const agent = config.agents[key];
    report(`Первый агент: ${key} → ${agent.command.join(' ')} (${agent.input === 'argument' ? 'промпт аргументом' : 'промпт через stdin'})`);
    return {outcome: 'dry-run', prompt: authorPrompt(root, id, {agent: nameOf(key)})};
  }

  for (let round = 1; round <= rounds; round++) {
    const card = loadCard(root, id);
    if (!['active', 'ready', 'draft'].includes(card.meta.status)) {
      report(`Задача в статусе ${card.meta.status}, эстафета остановлена.`);
      return {outcome: card.meta.status};
    }
    const available = pick(card);
    index = 0; // After a successful pick the chain's own order applies again.
    if (!available) {
      const earliest = [...unavailableUntil.values()].sort((a, b) => a - b)[0] ?? null;
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
    const agent = config.agents[available];
    const agentName = nameOf(available);
    takeLease(root, id, agentName, {relayId, ttlHours: Math.ceil(session.timeoutMinutes / 60) + 1});
    const before = progressMarker(root, id);
    report(`Раунд ${round}: ${agentName}`);
    const result = await runAgent(root, id, available, agent, authorPrompt(root, id, {agent: agentName}), {timeoutMinutes: session.timeoutMinutes, quiet, round});
    const outcome = classifyOutcome(result, agent.signals);
    const after = loadCard(root, id);
    const progressed = progressMarker(root, id) !== before;
    appendJournal(root, id, {actor: 'bridge', kind: 'trigger', text: `${agentName}: ${outcome.kind}, код ${result.code ?? result.signal}${outcome.retryAt ? `, восстановление ${isoSeconds(outcome.retryAt)}` : ''}; лог ${result.logFile.slice(root.length + 1)}`});

    if (outcome.kind === 'exited') {
      if (!['active', 'ready', 'draft'].includes(after.meta.status)) continue;
      stalled = progressed ? 0 : stalled + 1;
      if (stalled >= session.stallRounds) {
        handoff(root, id, {agent: agentName, reason: 'blocked', note: `${stalled} сессии подряд без продвижения; нужен человек`});
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
    const cooling = new Map(unavailableUntil).set(available, new Date(now().getTime() + 60_000));
    const next = chain.find(key => key !== available && !(cooling.get(key) > now()) && (!wantedModel(after) || config.agents[key].model === wantedModel(after)))
      ?? chain.find(key => key !== available && !(cooling.get(key) > now()));
    handoff(root, id, {agent: agentName, reason: REASON[outcome.kind], to: next ? nameOf(next) : '', force: true});
    // A reset time already in the past says nothing useful; wait an hour as when none is given.
    const reset = outcome.retryAt && outcome.retryAt > now() ? outcome.retryAt : new Date(now().getTime() + 3600_000);
    const cooldown = outcome.kind === 'limit' || outcome.kind === 'auth' ? reset : new Date(now().getTime() + 60_000);
    unavailableUntil.set(available, cooldown);
  }
  report(`Достигнут предел раундов (${rounds}).`);
  return {outcome: 'max-rounds'};
}
