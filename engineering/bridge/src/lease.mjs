import {execFileSync} from 'node:child_process';
import {closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {BridgeError} from './errors.mjs';
import {isoSeconds, now, paths, writeAtomic} from './store.mjs';

/**
 * Leases live outside the working tree: in the git common directory, shared by every worktree of the repository,
 * so two agents in two worktrees cannot both hold a task. Without git they fall back to `.bridge/runs/leases`.
 * The card itself carries only content, so taking or renewing a lease never touches a tracked file.
 */
export function leaseDirectory(root) {
  if (process.env.BRIDGE_LEASE_DIR) return resolve(process.env.BRIDGE_LEASE_DIR);
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    return join(isAbsolute(common) ? common : resolve(root, common), 'bridge', 'leases');
  } catch {
    return join(paths(root).runs, 'leases');
  }
}

const leaseFile = (root, id) => join(leaseDirectory(root), `${id}.json`);

export function readLease(root, id) {
  const file = leaseFile(root, id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export const isAlive = lease => Boolean(lease?.holder && lease.expires && new Date(lease.expires) > now());

/** The lease if someone holds it right now, else null. */
export function liveLease(root, id) {
  const lease = readLease(root, id);
  return isAlive(lease) ? lease : null;
}

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

/** A lock beside the lease files: every worktree contends on the same lock. */
export function withLeaseLock(root, id, action) {
  const directory = leaseDirectory(root);
  mkdirSync(directory, {recursive: true});
  const file = join(directory, `${id}.lock`);
  const deadline = Date.now() + 5000;
  let handle = null;
  while (handle === null) {
    try {
      handle = openSync(file, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - statSync(file).mtimeMs > 30000) rmSync(file, {force: true}); } catch { /* raced with its owner */ }
      if (Date.now() > deadline) throw new BridgeError('LOCKED', `Аренду ${id} сейчас меняет другой процесс. Повторите.`);
      Atomics.wait(sleepBuffer, 0, 0, 50);
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

export function writeLease(root, id, lease) {
  writeAtomic(leaseFile(root, id), `${JSON.stringify(lease, null, 2)}\n`);
}

export function clearLease(root, id) {
  rmSync(leaseFile(root, id), {force: true});
}

/** Whether `agent` in `session` is the one holding `lease`. A lease bound to a session belongs only to that session. */
export function holds(lease, agent, session = process.env.BRIDGE_SESSION || '') {
  if (!lease || lease.holder !== agent) return false;
  return !lease.session || !session || lease.session === session;
}

/**
 * Writers must hold the lease or find the task free. A live lease of someone else stops the write with exit code 3,
 * unless the caller forces it (the journal records who and why).
 */
export function requireWriter(root, id, agent, {force = false} = {}) {
  const lease = liveLease(root, id);
  if (lease && !holds(lease, agent) && !force) {
    const who = lease.session ? `${lease.holder} (сессия ${lease.session.slice(0, 8)})` : lease.holder;
    throw new BridgeError('TASK_HELD', `Задачу держит ${who} до ${lease.expires}. Не меняйте её параллельно; --force --because только с причиной.`, 3);
  }
  return lease;
}

export function newLease({agent, session = process.env.BRIDGE_SESSION || '', ttlHours}) {
  const at = now();
  return {holder: agent, session, claimed: isoSeconds(at), ttlHours, expires: isoSeconds(new Date(at.getTime() + ttlHours * 3600_000))};
}
