import {execFileSync} from 'node:child_process';

function git(root, args) {
  try {
    return execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000}).trimEnd();
  } catch {
    return null;
  }
}

/**
 * Mechanical state that needs no model to collect: it is what a handoff records when the agent could not.
 * Every value is null when git is unavailable.
 */
export function gitState(root, base = '') {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === null) return null;
  const head = git(root, ['log', '-1', '--format=%h%x09%s']);
  const [sha = '', subject = ''] = (head ?? '').split('\t');
  const dirty = (git(root, ['status', '--porcelain=v1', '--untracked-files=normal']) ?? '').split('\n').filter(Boolean)
    // The bridge's own files change with every command; they are not work in progress.
    .filter(line => !line.slice(3).startsWith('.bridge/'));
  let ahead = null, behind = null;
  if (base && git(root, ['rev-parse', '--verify', '--quiet', base]) !== null) {
    const counts = git(root, ['rev-list', '--left-right', '--count', `${base}...HEAD`]);
    if (counts) [behind, ahead] = counts.split(/\s+/).map(Number);
  }
  return {branch, sha, subject, dirty, ahead, behind, diffStat: git(root, ['diff', '--shortstat', 'HEAD']) ?? ''};
}

export function describeDirty(state, limit = 12) {
  if (!state) return 'git недоступен';
  if (!state.dirty.length) return 'нет';
  const shown = state.dirty.slice(0, limit).map(line => line.slice(3)).join(', ');
  const more = state.dirty.length > limit ? ` и ещё ${state.dirty.length - limit}` : '';
  return `${state.dirty.length} файл(ов): ${shown}${more}${state.diffStat ? ` (${state.diffStat.trim()})` : ''}`;
}

export function mergeBase(root, base) {
  return base ? git(root, ['merge-base', base, 'HEAD']) : null;
}

export function shortSha(root, ref) {
  return git(root, ['rev-parse', '--short', ref]);
}

export function diffStat(root, from, separator = '...') {
  return git(root, ['diff', '--stat', '--stat-width=100', `${from}${separator}HEAD`]);
}

/** A fingerprint of the work itself: commits, the diff and the set of changed files. */
export function workFingerprint(root) {
  return [git(root, ['rev-parse', 'HEAD']) ?? '', git(root, ['diff', 'HEAD', '--stat']) ?? '', (git(root, ['status', '--porcelain=v1']) ?? '')
    .split('\n').filter(line => line && !line.slice(3).startsWith('.bridge/')).join('\n')].join('\n');
}

export function changedFiles(root, base) {
  const output = base ? git(root, ['diff', '--name-only', `${base}...HEAD`]) : null;
  return output ? output.split('\n').filter(Boolean) : [];
}
