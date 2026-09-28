import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readJournal} from './journal.mjs';
import {parseReview} from './review.mjs';
import {paths, readCards} from './store.mjs';

const hours = (from, to) => (new Date(to) - new Date(from)) / 3600_000;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Delivery measurements from journals and review files: cycle time by risk, review rounds, blocking findings,
 * handoffs by reason and sessions per task. They answer whether the process got faster and where it loses time.
 */
export function collectStats(root, {since = ''} = {}) {
  const tasks = readCards(root).map(({id, card}) => {
    const journal = readJournal(root, id).filter(entry => !since || entry.at >= since);
    const created = readJournal(root, id).find(entry => entry.kind === 'create')?.at ?? null;
    const reviewAt = journal.find(entry => entry.kind === 'status' && entry.text.startsWith('review'))?.at ?? null;
    const doneAt = journal.find(entry => entry.kind === 'status' && entry.text.startsWith('done'))?.at ?? null;
    const directory = paths(root).reviews(id);
    const reviews = existsSync(directory) ? readdirSync(directory).filter(name => /^R\d+\.md$/.test(name))
      .map(name => parseReview(readFileSync(join(directory, name), 'utf8'))) : [];
    const handoffs = {};
    for (const entry of journal.filter(item => item.kind === 'handoff')) {
      const reason = entry.text.split(/[;\s→]/)[0];
      handoffs[reason] = (handoffs[reason] ?? 0) + 1;
    }
    return {
      id, risk: card.meta.risk, status: card.meta.status,
      toReviewHours: created && reviewAt ? hours(created, reviewAt) : null,
      cycleHours: created && doneAt ? hours(created, doneAt) : null,
      rounds: new Set(reviews.map(review => Number(review.meta.round) || 0)).size,
      blocking: reviews.flatMap(review => review.findings).filter(finding => finding.priority === 'P0' || finding.priority === 'P1').length,
      sessions: journal.filter(entry => entry.kind === 'claim').length,
      handoffs,
    };
  });
  const byRisk = {};
  for (const task of tasks) {
    const group = byRisk[task.risk] ??= {tasks: 0, done: 0, cycle: [], rounds: [], blocking: 0};
    group.tasks++;
    if (task.cycleHours !== null) { group.done++; group.cycle.push(task.cycleHours); }
    group.rounds.push(task.rounds);
    group.blocking += task.blocking;
  }
  const summary = Object.fromEntries(Object.entries(byRisk).map(([risk, group]) => [risk, {
    tasks: group.tasks, done: group.done, medianCycleHours: median(group.cycle), medianReviewRounds: median(group.rounds), blockingFindings: group.blocking,
  }]));
  const handoffs = {};
  for (const task of tasks) for (const [reason, count] of Object.entries(task.handoffs)) handoffs[reason] = (handoffs[reason] ?? 0) + count;
  return {tasks, byRisk: summary, handoffs};
}
