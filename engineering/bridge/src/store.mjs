import {closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {BridgeError} from './errors.mjs';
import {FORMAT_VERSION, parseCard, renderCard} from './card.mjs';

export const TASK_ID = /^\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Tests pin the clock through BRIDGE_NOW; everything else uses real UTC time. */
export function now() {
  return process.env.BRIDGE_NOW ? new Date(process.env.BRIDGE_NOW) : new Date();
}
export const isoSeconds = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The nearest directory with `.bridge/`, else the nearest git root, else the start directory. */
export function findRoot(start = process.cwd()) {
  if (process.env.BRIDGE_ROOT) return resolve(process.env.BRIDGE_ROOT);
  let directory = resolve(start), gitRoot = null;
  for (;;) {
    if (existsSync(join(directory, '.bridge'))) return directory;
    if (!gitRoot && existsSync(join(directory, '.git'))) gitRoot = directory;
    const parent = dirname(directory);
    if (parent === directory) return gitRoot ?? resolve(start);
    directory = parent;
  }
}

export function paths(root) {
  const base = join(root, '.bridge');
  return {
    base, config: join(base, 'config.json'), tasks: join(base, 'tasks'), runs: join(base, 'runs'),
    task: id => join(base, 'tasks', id),
    card: id => join(base, 'tasks', id, 'task.md'),
    journal: id => join(base, 'tasks', id, 'journal.md'),
    reviews: id => join(base, 'tasks', id, 'reviews'),
    run: id => join(base, 'runs', id),
  };
}

export function requireInitialized(root) {
  if (!existsSync(paths(root).tasks)) throw new BridgeError('NOT_INITIALIZED', `Мост не настроен в ${root}. Выполните: bridge init`);
}

export function writeAtomic(file, text) {
  mkdirSync(dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, text);
  renameSync(temporary, file);
}

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const sleep = milliseconds => Atomics.wait(sleepBuffer, 0, 0, milliseconds);

/** Serializes writers of one task across processes: two agents or a hook and an agent never interleave edits. */
export function withLock(root, id, action) {
  const file = join(paths(root).runs, 'locks', `${id}.lock`);
  mkdirSync(dirname(file), {recursive: true});
  const deadline = Date.now() + 5000;
  let handle = null;
  while (handle === null) {
    try {
      handle = openSync(file, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // A lock older than 30 s belongs to a writer that died mid-edit.
      try { if (Date.now() - statSync(file).mtimeMs > 30000) rmSync(file, {force: true}); } catch { /* raced with its owner */ }
      if (Date.now() > deadline) throw new BridgeError('LOCKED', `Карточку ${id} сейчас изменяет другой процесс. Повторите.`);
      sleep(50);
    }
  }
  try {
    writeFileSync(handle, String(process.pid));
    return action();
  } finally {
    closeSync(handle);
    rmSync(file, {force: true});
  }
}

export function listTaskIds(root) {
  const directory = paths(root).tasks;
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => TASK_ID.test(name) && existsSync(paths(root).card(name))).sort();
}

export function readCardText(root, id) {
  const file = paths(root).card(id);
  if (!existsSync(file)) throw new BridgeError('TASK_NOT_FOUND', `Задача ${id} не найдена.`);
  return readFileSync(file, 'utf8');
}

export function loadCard(root, id) {
  const card = parseCard(readCardText(root, id));
  if (card.meta.bridge !== FORMAT_VERSION) {
    throw new BridgeError('FORMAT_VERSION', `Карточка ${id} в формате bridge: ${card.meta.bridge}, этот CLI понимает ${FORMAT_VERSION}.`);
  }
  return card;
}

/** Loads, lets `edit` change the card, stamps `updated` and writes atomically under the task lock. */
export function mutateCard(root, id, edit) {
  return withLock(root, id, () => {
    const card = loadCard(root, id);
    const result = edit(card);
    card.meta.updated = isoSeconds(now());
    writeAtomic(paths(root).card(id), renderCard(card));
    return result;
  });
}

/**
 * Every card that parses, plus the ids of those that do not. One broken card must not stop commands or hooks
 * that concern other tasks; the broken ones are reported on stderr.
 */
export function readCards(root, {warn = true} = {}) {
  const cards = [];
  for (const id of listTaskIds(root)) {
    try {
      cards.push({id, card: loadCard(root, id)});
    } catch (error) {
      if (warn) process.stderr.write(`bridge: карточка ${id} не читается: ${error.message}\n`);
    }
  }
  return cards;
}

/**
 * Picks the task a command means when none is named: BRIDGE_TASK, else the task this agent holds, else the only
 * active one, else the only task that is not finished. `heldBy` returns the ids the agent holds (leases).
 */
export function resolveTaskId(root, given, {heldBy = () => []} = {}) {
  if (given) {
    if (!TASK_ID.test(given)) {
      const matches = listTaskIds(root).filter(id => id.endsWith(`-${given}`) || id.includes(given));
      if (matches.length === 1) return matches[0];
      throw new BridgeError('TASK_NOT_FOUND', matches.length ? `Уточните задачу: ${matches.join(', ')}` : `Задача ${given} не найдена.`);
    }
    return given;
  }
  if (process.env.BRIDGE_TASK && TASK_ID.test(process.env.BRIDGE_TASK)) return process.env.BRIDGE_TASK;
  const held = heldBy();
  if (held.length === 1) return held[0];
  const cards = readCards(root);
  const active = cards.filter(entry => entry.card.meta.status === 'active');
  if (active.length === 1) return active[0].id;
  const open = cards.filter(entry => !['done', 'cancelled'].includes(entry.card.meta.status));
  if (open.length === 1) return open[0].id;
  throw new BridgeError('TASK_AMBIGUOUS', open.length ? `Укажите задачу: ${open.map(entry => entry.id).join(', ')}` : 'Открытых задач нет.');
}

export function loadConfig(root) {
  const file = paths(root).config;
  if (!existsSync(file)) return {bridge: 1, agents: {}, chain: []};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BridgeError('CONFIG', `.bridge/config.json не разбирается: ${error.message}`);
  }
}
