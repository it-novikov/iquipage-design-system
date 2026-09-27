import {closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BridgeError} from './errors.mjs';
import {
  FIELD, HANDOFF_FIELDS, RISKS, SECTION, TASK_STATUSES, STEP_STATUSES, answerQuestion, appendAcceptance, appendEntry, appendFieldItem,
  appendStep, checkAcceptance, checkCriteria, findStep, nextEntryNumber, oneLine, parseAcceptance, parseCard, parseSteps, renderCard, section,
  setField, setStepField, updateStep,
} from './card.mjs';
import {appendJournal} from './journal.mjs';
import {describeDirty, gitState, mergeBase, shortSha} from './git.mjs';
import {clearLease, holds, liveLease, newLease, readLease, requireWriter, withLeaseLock, writeLease} from './lease.mjs';
import {isBlocking, parseReview, reviewTemplate} from './review.mjs';
import {requireNoSecrets} from './secrets.mjs';
import {TASK_ID, isoSeconds, loadCard, mutateCard, now, paths, readCards, requireInitialized, withLock, writeAtomic} from './store.mjs';

export const BRIDGE_HOME = dirname(dirname(fileURLToPath(import.meta.url)));

/** The command an agent types, relative to the repository root when the CLI lives inside it. */
export function bridgeCommand(root) {
  const file = join(BRIDGE_HOME, 'bin', 'bridge');
  const path = relative(root, file);
  return path.startsWith('..') ? file : path;
}

/**
 * Who is acting: `--agent`, else BRIDGE_AGENT (set by the relay and by the Claude Code session hook), else the
 * human at the terminal as `human:<user>`. An agent never silently borrows a person's name.
 */
export function actorName(explicit) {
  return explicit || process.env.BRIDGE_AGENT || `human:${process.env.USER || 'unknown'}`;
}

export function init(root) {
  const location = paths(root);
  mkdirSync(location.tasks, {recursive: true});
  mkdirSync(location.runs, {recursive: true});
  const ignore = join(location.base, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '# Locks and raw agent logs are local.\nruns/\n');
  if (!existsSync(location.config)) writeFileSync(location.config, readFileSync(join(BRIDGE_HOME, 'templates', 'config.json'), 'utf8'));
  return location.base;
}

const slugify = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function createTask(root, {slug, title, risk = 'standard', owner = '', branch = '', base = '', actor}) {
  requireInitialized(root);
  if (!title) throw new BridgeError('TITLE_REQUIRED', 'Нужно название: --title "…".');
  if (!RISKS.includes(risk)) throw new BridgeError('RISK', `Уровень риска: ${RISKS.join(', ')}.`);
  requireNoSecrets(title);
  const day = isoSeconds(now()).slice(0, 10);
  const id = `${day.replace(/-/g, '')}-${slugify(slug || title)}`;
  if (!TASK_ID.test(id)) throw new BridgeError('SLUG', 'Короткое имя задачи — латиница, цифры и дефисы.');
  if (existsSync(paths(root).card(id))) throw new BridgeError('TASK_EXISTS', `Задача ${id} уже есть.`);
  const card = parseCard(readFileSync(join(BRIDGE_HOME, 'templates', 'task.md'), 'utf8'));
  Object.assign(card.meta, {
    id, title: oneLine(title), status: 'draft', risk, owner: owner || process.env.BRIDGE_OWNER || process.env.USER || '',
    branch, base, created: day, updated: isoSeconds(now()), links: [],
  });
  card.title = oneLine(title);
  writeAtomic(paths(root).card(id), renderCard(card));
  appendJournal(root, id, {actor, kind: 'create', text: title});
  return id;
}

/** Ids of the tasks `agent` holds in this session. */
export function heldBy(root, agent) {
  return readCards(root, {warn: false}).map(entry => entry.id).filter(id => holds(liveLease(root, id), agent));
}

export function claim(root, id, {agent, ttlHours = 4, force = false, reason = ''}) {
  if (!agent) throw new BridgeError('AGENT_REQUIRED', 'Укажите имя: --agent <имя> или переменная BRIDGE_AGENT.');
  const card = loadCard(root, id);
  if (['review', 'done', 'cancelled'].includes(card.meta.status) && !force) {
    throw new BridgeError('TASK_CLOSED', `Задача в статусе ${card.meta.status}. Вернуть её в работу может владелец: bridge status ${id} ready.`);
  }
  let previous = null;
  withLeaseLock(root, id, () => {
    previous = liveLease(root, id);
    if (previous && !holds(previous, agent) && !force) {
      throw new BridgeError('TASK_HELD', `Задачу держит ${previous.holder} до ${previous.expires}. Не работайте над ней параллельно.`, 3);
    }
    writeLease(root, id, newLease({agent, ttlHours}));
  });
  // Starting work is a content change once; renewals and handoffs never touch the tracked card.
  if (['draft', 'ready'].includes(card.meta.status)) mutateCard(root, id, edited => { edited.meta.status = 'active'; });
  const takeover = previous && !holds(previous, agent) ? `после ${previous.holder}` : '';
  appendJournal(root, id, {actor: agent, kind: 'claim', text: [takeover, force ? `принудительно: ${reason || 'без причины'}` : ''].filter(Boolean).join('; ') || 'взял задачу'});
}

export function release(root, id, {agent, note = '', force = false}) {
  withLeaseLock(root, id, () => {
    const lease = readLease(root, id);
    if (lease && liveLease(root, id) && !holds(lease, agent) && !force) {
      throw new BridgeError('NOT_HOLDER', `Задачу держит ${lease.holder}, а не ${agent}.`, 3);
    }
    clearLease(root, id);
  });
  appendJournal(root, id, {actor: agent, kind: 'release', text: note || 'отпустил задачу'});
}

/** Extends a live lease by the period it was taken for. */
function renew(root, id, agent) {
  withLeaseLock(root, id, () => {
    const lease = readLease(root, id);
    if (holds(lease, agent)) writeLease(root, id, {...lease, expires: newLease({agent, ttlHours: lease.ttlHours ?? 4}).expires});
  });
}

export function checkpoint(root, id, {agent, state, current, next, uncommitted, traps = [], verify, force = false}) {
  requireWriter(root, id, agent, {force});
  requireNoSecrets(state, current, next, uncommitted, verify, ...traps);
  const git = gitState(root);
  mutateCard(root, id, card => {
    const handoff = section(card, SECTION.handoff, {create: true});
    const put = (label, value) => { if (value !== undefined && value !== null && value !== '') setField(handoff.lines, label, value, [], HANDOFF_FIELDS); };
    put(FIELD.state, state);
    put(FIELD.now, current);
    put(FIELD.next, next);
    put(FIELD.uncommitted, uncommitted);
    // The mechanical snapshot has its own field and never overwrites what the agent wrote about its work in progress.
    if (git) put(FIELD.workingCopy, `${describeDirty(git)} · HEAD ${git.sha}`);
    put(FIELD.verify, verify);
    for (const trap of traps) appendFieldItem(handoff.lines, FIELD.traps, trap, HANDOFF_FIELDS);
  });
  renew(root, id, agent);
  appendJournal(root, id, {actor: agent, kind: 'checkpoint', ref: /^S\d+/.exec(current ?? '')?.[0] ?? '-', text: next ? `дальше: ${next}` : state ?? 'контрольная точка'});
}

export function setStep(root, id, stepId, status, {agent, result, check, force = false}) {
  if (!STEP_STATUSES.includes(status)) throw new BridgeError('STEP_STATUS', `Статус шага: ${STEP_STATUSES.join(', ')}.`);
  requireWriter(root, id, agent, {force});
  requireNoSecrets(result);
  mutateCard(root, id, card => {
    findStep(card, stepId);
    updateStep(card, stepId, (heading, body) => {
      heading.status = status;
      if (check) checkCriteria(body, check === 'all' ? 'all' : String(check).split(',').map(Number));
      if (result) setStepField(body, FIELD.result, result);
    });
    const step = findStep(card, stepId);
    if (status === 'done') {
      const open = step.criteria.filter(item => !item.done);
      if (open.length) throw new BridgeError('CRITERIA_OPEN', `Не отмечены критерии ${stepId}: ${open.map(item => `«${item.text}»`).join('; ')}. Добавьте --check all, если они выполнены.`);
      if (!step.fields[FIELD.result]) throw new BridgeError('RESULT_REQUIRED', 'У готового шага нужен итог: --result "коммит, проверки".');
    }
    if (status === 'dropped' && !step.fields[FIELD.result]) throw new BridgeError('RESULT_REQUIRED', 'Укажите причину отмены: --result "…".');
    if (status === 'active') {
      const others = parseSteps(card).filter(item => item.status === 'active' && item.id !== step.id);
      if (others.length) throw new BridgeError('STEP_ACTIVE', `Уже активен ${others.map(item => item.id).join(', ')}. Сначала завершите или верните его в todo.`);
    }
  });
  appendJournal(root, id, {actor: agent, kind: 'step', ref: stepId.toUpperCase(), text: `${status}${result ? `: ${result}` : ''}`});
}

export function addStep(root, id, input) {
  if (!input.title || !input.what || !input.how || !input.why || !input.accept?.length) {
    throw new BridgeError('STEP_FIELDS', 'Шагу нужны --title, --what, --how, --why и хотя бы один --accept.');
  }
  requireWriter(root, id, input.agent, {force: input.force});
  requireNoSecrets(input.title, input.what, input.how, input.why, ...input.accept);
  const stepId = mutateCard(root, id, card => appendStep(card, input));
  appendJournal(root, id, {actor: input.agent, kind: 'note', ref: stepId, text: `добавлен шаг: ${input.title}`});
  return stepId;
}

export function addAcceptance(root, id, text, {agent, force = false}) {
  requireWriter(root, id, agent, {force});
  requireNoSecrets(text);
  const ref = mutateCard(root, id, card => appendAcceptance(card, text));
  appendJournal(root, id, {actor: agent, kind: 'note', ref, text: `критерий приёмки: ${text}`});
  return ref;
}

export function acceptCriterion(root, id, criterionId, {agent, force = false}) {
  requireWriter(root, id, agent, {force});
  mutateCard(root, id, card => checkAcceptance(card, criterionId));
  appendJournal(root, id, {actor: agent, kind: 'note', ref: criterionId.toUpperCase(), text: 'критерий приёмки выполнен'});
}

/** What stops a task from being `done`: unfinished steps, unmet task criteria, open P0/P1 review findings. */
export function completionBlockers(root, id, card = loadCard(root, id)) {
  const blockers = [];
  const unfinished = parseSteps(card).filter(step => !['done', 'dropped'].includes(step.status));
  if (unfinished.length) blockers.push(`не завершены шаги ${unfinished.map(step => step.id).join(', ')}`);
  const unmet = parseAcceptance(card).filter(item => !item.done);
  if (unmet.length) blockers.push(`не выполнены критерии ${unmet.map(item => item.id).join(', ')}`);
  const reviews = paths(root).reviews(id);
  const open = existsSync(reviews) ? readdirSync(reviews).filter(name => /^R\d+\.md$/.test(name))
    .flatMap(name => parseReview(readFileSync(join(reviews, name), 'utf8')).findings.filter(isBlocking).map(finding => `${name.slice(0, -3)}/${finding.id}`)) : [];
  if (open.length) blockers.push(`открыты P0/P1: ${open.join(', ')}`);
  return blockers;
}

export function setStatus(root, id, status, {agent, note = '', force = false, reason = ''}) {
  if (!TASK_STATUSES.includes(status)) throw new BridgeError('STATUS', `Статус задачи: ${TASK_STATUSES.join(', ')}.`);
  requireWriter(root, id, agent, {force});
  requireNoSecrets(note, reason);
  if (status === 'done') {
    const blockers = completionBlockers(root, id);
    if (blockers.length && !force) throw new BridgeError('NOT_COMPLETE', `Задачу нельзя закрыть: ${blockers.join('; ')}. --force --because только по решению владельца.`);
  }
  mutateCard(root, id, card => { card.meta.status = status; });
  if (['review', 'done', 'cancelled', 'draft'].includes(status)) withLeaseLock(root, id, () => clearLease(root, id));
  appendJournal(root, id, {actor: agent, kind: 'status', text: `${status}${note ? `: ${note}` : ''}${force ? `; принудительно: ${reason || 'без причины'}` : ''}`});
}

export function decide(root, id, text, {agent, force = false}) {
  requireWriter(root, id, agent, {force});
  requireNoSecrets(text);
  const ref = mutateCard(root, id, card => {
    const n = nextEntryNumber(card, 'D');
    appendEntry(card, SECTION.decisions, `- **D${n}** (${isoSeconds(now()).slice(0, 10)}) ${oneLine(text)}`);
    return `D${n}`;
  });
  appendJournal(root, id, {actor: agent, kind: 'decision', ref, text});
  return ref;
}

export function ask(root, id, text, {agent, to = 'владелец', force = false}) {
  requireWriter(root, id, agent, {force});
  requireNoSecrets(text, to);
  const ref = mutateCard(root, id, card => {
    const n = nextEntryNumber(card, 'Q');
    appendEntry(card, SECTION.questions, `- **Q${n}** [open] ${oneLine(text)} → ${oneLine(to)}`);
    return `Q${n}`;
  });
  appendJournal(root, id, {actor: agent, kind: 'question', ref, text});
  return ref;
}

/** Answering is how the owner unblocks an agent, so it does not require the lease. */
export function answer(root, id, questionId, text, {agent}) {
  requireNoSecrets(text);
  mutateCard(root, id, card => answerQuestion(card, questionId, text));
  appendJournal(root, id, {actor: agent, kind: 'answer', ref: questionId.toUpperCase(), text});
}

export function note(root, id, text, {agent}) {
  requireNoSecrets(text);
  withLock(root, id, () => appendJournal(root, id, {actor: agent, kind: 'note', text}));
}

export const HANDOFF_REASONS = ['planned', 'limit', 'error', 'auth', 'context', 'timeout', 'review', 'blocked'];

/**
 * Closes a session so another agent can continue. What is recorded here is mechanical: an agent that hit a limit
 * could not write a summary, so the card keeps its last checkpoint and gains only what git can still tell.
 */
export function handoff(root, id, {agent, reason = 'planned', to = '', note: text = '', force = false}) {
  if (!HANDOFF_REASONS.includes(reason)) throw new BridgeError('REASON', `Причина передачи: ${HANDOFF_REASONS.join(', ')}.`);
  requireWriter(root, id, agent, {force});
  requireNoSecrets(text);
  const git = gitState(root);
  const at = isoSeconds(now());
  mutateCard(root, id, card => {
    const handoffSection = section(card, SECTION.handoff, {create: true});
    if (git) setField(handoffSection.lines, FIELD.workingCopy, `${describeDirty(git)} · HEAD ${git.sha} · снято ${at}`, [], HANDOFF_FIELDS);
    setField(handoffSection.lines, FIELD.reason, `${reason} — ${agent || 'unknown'}, ${at}${to ? `, передано ${to}` : ''}${text ? `: ${oneLine(text)}` : ''}`, [], HANDOFF_FIELDS);
    if (reason === 'blocked') card.meta.status = 'blocked';
  });
  withLeaseLock(root, id, () => {
    const lease = readLease(root, id);
    if (!lease || holds(lease, agent) || force) clearLease(root, id);
  });
  const record = {task: id, reason, from: agent || 'unknown', to, at, note: text, git: git && {branch: git.branch, sha: git.sha, dirty: git.dirty.length}};
  writeAtomic(join(paths(root).run(id), 'handoff.json'), `${JSON.stringify(record, null, 2)}\n`);
  appendJournal(root, id, {actor: agent, kind: 'handoff', text: `${reason}${to ? ` → ${to}` : ''}${git ? `; HEAD ${git.sha}; незакоммичено ${git.dirty.length}` : ''}${text ? `; ${text}` : ''}`});
  return record;
}

/**
 * Opens the next review file. Parallel reviewers of one round share the round number; each gets its own file,
 * created exclusively so two reviewers never overwrite each other.
 */
export function startReview(root, id, {reviewer, base, round: requestedRound, since = ''}) {
  const card = loadCard(root, id);
  const baseRef = base || card.meta.base || 'main';
  const directory = paths(root).reviews(id);
  mkdirSync(directory, {recursive: true});
  return withLock(root, id, () => {
    const existing = readdirSync(directory).filter(name => /^R\d+\.md$/.test(name))
      .map(name => ({name, number: Number(name.slice(1, -3)), meta: parseReview(readFileSync(join(directory, name), 'utf8')).meta}));
    const lastRound = Math.max(0, ...existing.map(item => Number(item.meta.round) || 0));
    const round = requestedRound ?? (existing.some(item => Number(item.meta.round) === lastRound && item.meta.verdict === 'pending') ? lastRound : lastRound + 1);
    const number = Math.max(0, ...existing.map(item => item.number)) + 1;
    const reviewId = `R${number}`;
    const file = join(directory, `${reviewId}.md`);
    const baseSha = mergeBase(root, baseRef) ?? '';
    const wanted = since ? since.split(',').map(item => item.trim().toUpperCase()).filter(Boolean) : [];
    const previous = wanted.map(name => existing.find(item => item.name === `${name}.md`) ?? name);
    const missing = previous.filter(item => typeof item === 'string');
    if (missing.length) throw new BridgeError('REVIEW_NOT_FOUND', `Ревью ${missing.join(', ')} не найдено.`);
    const handle = openSync(file, 'wx');
    try {
      writeFileSync(handle, reviewTemplate({
        id: reviewId, task: id, reviewer: reviewer || 'unknown', round, base: baseSha ? shortSha(root, baseSha) : baseRef,
        head: shortSha(root, 'HEAD') ?? '', created: isoSeconds(now()),
      }));
    } finally {
      closeSync(handle);
    }
    appendJournal(root, id, {actor: reviewer, kind: 'review', ref: reviewId, text: `начато ревью, раунд ${round}${wanted.length ? `, после ${wanted.join(', ')}` : ''}`});
    return {reviewId, file, baseRef, baseSha, round, previous: previous.map(item => ({id: item.name.slice(0, -3), head: String(item.meta.head), file: join(directory, item.name)}))};
  });
}
