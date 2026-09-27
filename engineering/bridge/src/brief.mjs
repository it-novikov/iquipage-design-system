import {FIELD, SECTION, fieldText, parseDecisions, parseQuestions, parseSteps, section} from './card.mjs';
import {describeDirty} from './git.mjs';

const MARK = {done: '✓', active: '▶', todo: '○', blocked: '■', dropped: '×'};
const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

function sectionText(card, name) {
  const found = section(card, name);
  if (!found) return '';
  const lines = [...found.lines];
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.join('\n');
}

function stepLines(step, full) {
  const head = `${MARK[step.status] ?? '?'} ${step.id}. ${step.title}${step.status === 'blocked' ? ' [blocked]' : ''}`;
  if (!full) {
    const result = fieldText(step.fields[FIELD.result]).replace(/\n/g, ' ');
    return [result && step.status === 'done' ? `${head} — ${clip(result, 110)}` : head];
  }
  const body = step.lines.filter(line => line.trim());
  return [`${head} [${step.status}]`, ...body.map(line => `  ${line}`)];
}

/**
 * The compact context an incoming agent reads first. Level 0 shows the active step and the next two in full;
 * higher levels shed detail until the text fits the budget.
 */
export function renderBrief(card, {git = null, journal = [], budget = 7000, cardPath = '', lease = null} = {}) {
  for (let level = 0; level <= 3; level++) {
    const text = compose(card, {git, journal, level, cardPath, lease});
    if (text.length <= budget || level === 3) return text;
  }
  return '';
}

function compose(card, {git, journal, level, cardPath, lease}) {
  const meta = card.meta;
  const out = [`# ${card.title ?? meta.title}`, `${meta.id} · ${meta.status} · риск ${meta.risk} · владелец ${meta.owner || '—'}`];
  const holder = lease ? `держит ${lease.holder} до ${lease.expires}` : 'свободна';
  if (git) {
    const mismatch = meta.branch && git.branch !== meta.branch ? ` ⚠ карточка ведётся в ${meta.branch}` : '';
    out.push(`Ветка ${git.branch}${mismatch} · HEAD ${git.sha} «${clip(git.subject, 60)}» · незакоммичено: ${describeDirty(git, 6)} · ${holder}`);
  } else {
    out.push(`Задача ${holder}`);
  }
  for (const name of [SECTION.goal, SECTION.scope, SECTION.acceptance, SECTION.handoff]) {
    if (name === SECTION.acceptance && !section(card, name)) continue;
    const text = sectionText(card, name);
    out.push('', `## ${name}`, text || '—');
  }

  const steps = parseSteps(card);
  const done = steps.filter(step => step.status === 'done').length;
  const dropped = steps.filter(step => step.status === 'dropped').length;
  out.push('', `## План: готово ${done} из ${steps.length - dropped}${dropped ? `, отменено ${dropped}` : ''}`);
  const active = steps.find(step => step.status === 'active');
  const upcoming = steps.filter(step => ['todo', 'blocked'].includes(step.status)).slice(0, level === 0 ? 2 : level === 1 ? 1 : 0);
  const fullIds = new Set([active?.id, ...upcoming.map(step => step.id)].filter(Boolean));
  if (!active && level < 3 && upcoming[0]) fullIds.add(upcoming[0].id);
  for (const step of steps) {
    if (step.status === 'dropped') continue;
    if (step.status === 'done' && level >= 2) continue;
    out.push(...stepLines(step, fullIds.has(step.id)));
  }
  if (level >= 2 && done) out.push(`(готовые шаги скрыты: ${done})`);

  const decisions = parseDecisions(card);
  if (decisions.length) {
    const shown = decisions.slice(-(level >= 2 ? 3 : 6));
    out.push('', `## Решения${shown.length < decisions.length ? ` (последние ${shown.length} из ${decisions.length})` : ''}`);
    for (const decision of shown) out.push(`- ${decision.id} ${clip(decision.text, level >= 2 ? 140 : 260)}`);
  }
  const questions = parseQuestions(card).filter(item => item.status === 'open');
  if (questions.length) out.push('', '## Открытые вопросы', ...questions.map(item => `- ${item.id} ${item.text}`));
  const context = sectionText(card, SECTION.context);
  if (context && level < 3) out.push('', `## ${SECTION.context}`, context);
  const recent = journal.slice(-(level >= 2 ? 2 : 4));
  if (recent.length) out.push('', '## Последние события', ...recent.map(entry => `- ${entry.at} ${entry.actor} ${entry.kind} ${entry.ref === '-' ? '' : `${entry.ref} `}${clip(entry.text, 140)}`));
  if (cardPath) out.push('', `Полная карточка: ${cardPath}`);
  return `${out.join('\n')}\n`;
}
