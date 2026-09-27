import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BridgeError} from './errors.mjs';
import {
  FIELD, HANDOFF_FIELDS, RISKS, SECTION, TASK_STATUSES, STEP_STATUSES, answerQuestion, appendEntry, appendFieldItem, appendStep,
  checkCriteria, field, fieldText, findStep, nextEntryNumber, oneLine, parseCard, parseSteps, renderCard, section, setField, setStepField,
  updateStep,
} from './card.mjs';
import {appendJournal} from './journal.mjs';
import {describeDirty, gitState, mergeBase, shortSha} from './git.mjs';
import {reviewTemplate} from './review.mjs';
import {TASK_ID, isoSeconds, loadCard, mutateCard, now, paths, requireInitialized, withLock, writeAtomic} from './store.mjs';

export const BRIDGE_HOME = dirname(dirname(fileURLToPath(import.meta.url)));

/** The command an agent types, relative to the repository root when the CLI lives inside it. */
export function bridgeCommand(root) {
  const file = join(BRIDGE_HOME, 'bin', 'bridge');
  const path = relative(root, file);
  return path.startsWith('..') ? file : path;
}

export function init(root) {
  const location = paths(root);
  mkdirSync(location.tasks, {recursive: true});
  mkdirSync(location.runs, {recursive: true});
  const ignore = join(location.base, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '# Leases, locks and raw agent logs are local.\nruns/\n');
  if (!existsSync(location.config)) writeFileSync(location.config, readFileSync(join(BRIDGE_HOME, 'templates', 'config.json'), 'utf8'));
  return location.base;
}

const slugify = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function createTask(root, {slug, title, risk = 'standard', owner = '', branch = '', base = '', actor}) {
  requireInitialized(root);
  if (!title) throw new BridgeError('TITLE_REQUIRED', 'Нужно название: --title "…".');
  if (!RISKS.includes(risk)) throw new BridgeError('RISK', `Уровень риска: ${RISKS.join(', ')}.`);
  const day = isoSeconds(now()).slice(0, 10);
  const id = `${day.replace(/-/g, '')}-${slugify(slug || title)}`;
  if (!TASK_ID.test(id)) throw new BridgeError('SLUG', 'Короткое имя задачи — латиница, цифры и дефисы.');
  if (existsSync(paths(root).card(id))) throw new BridgeError('TASK_EXISTS', `Задача ${id} уже есть.`);
  const template = readFileSync(join(BRIDGE_HOME, 'templates', 'task.md'), 'utf8');
  const card = parseCard(template);
  Object.assign(card.meta, {
    id, title: oneLine(title), status: 'draft', risk, owner: owner || process.env.BRIDGE_OWNER || process.env.USER || '',
    holder: '', lease: '', branch, base, created: day, updated: isoSeconds(now()), links: [],
  });
  card.title = oneLine(title);
  writeAtomic(paths(root).card(id), renderCard(card));
  appendJournal(root, id, {actor, kind: 'create', text: title});
  return id;
}

const leaseUntil = hours => isoSeconds(new Date(now().getTime() + hours * 3600_000));
const leaseAlive = meta => meta.holder && meta.lease && new Date(meta.lease) > now();

export function claim(root, id, {agent, ttlHours = 4, force = false, reason = ''}) {
  if (!agent) throw new BridgeError('AGENT_REQUIRED', 'Укажите имя: --agent <имя> или переменная BRIDGE_AGENT.');
  let previous = '';
  mutateCard(root, id, card => {
    const meta = card.meta;
    if (['review', 'done', 'cancelled'].includes(meta.status) && !force) {
      throw new BridgeError('TASK_CLOSED', `Задача в статусе ${meta.status}. Изменить статус может владелец: bridge status ${id} active.`);
    }
    if (leaseAlive(meta) && meta.holder !== agent && !force) {
      throw new BridgeError('TASK_HELD', `Задачу держит ${meta.holder} до ${meta.lease}. Не работайте над ней параллельно.`, 3);
    }
    previous = meta.holder && meta.holder !== agent ? meta.holder : '';
    meta.holder = agent;
    meta.lease = leaseUntil(ttlHours);
    if (['draft', 'ready'].includes(meta.status) || force && ['review', 'done', 'cancelled'].includes(meta.status)) meta.status = 'active';
  });
  appendJournal(root, id, {actor: agent, kind: 'claim', text: [previous ? `после ${previous}` : '', force ? `принудительно: ${reason || 'без причины'}` : ''].filter(Boolean).join('; ') || 'взял задачу'});
}

export function release(root, id, {agent, note = ''}) {
  mutateCard(root, id, card => {
    const meta = card.meta;
    if (meta.holder && agent && meta.holder !== agent) throw new BridgeError('NOT_HOLDER', `Задачу держит ${meta.holder}, а не ${agent}.`);
    meta.holder = '';
    meta.lease = '';
    if (meta.status === 'active') meta.status = 'ready';
  });
  appendJournal(root, id, {actor: agent, kind: 'release', text: note || 'отпустил задачу'});
}

export function checkpoint(root, id, {agent, state, current, next, uncommitted, traps = [], verify, ttlHours = 4}) {
  const git = gitState(root);
  mutateCard(root, id, card => {
    const handoff = section(card, SECTION.handoff, {create: true});
    const put = (label, value) => { if (value !== undefined && value !== null && value !== '') setField(handoff.lines, label, value, [], HANDOFF_FIELDS); };
    put(FIELD.state, state);
    put(FIELD.now, current);
    put(FIELD.next, next);
    put(FIELD.uncommitted, uncommitted === 'auto' || (uncommitted === undefined && git) ? describeDirty(git) : uncommitted);
    put(FIELD.verify, verify);
    for (const trap of traps) appendFieldItem(handoff.lines, FIELD.traps, trap, HANDOFF_FIELDS);
    if (card.meta.holder && card.meta.holder === agent) card.meta.lease = leaseUntil(ttlHours);
  });
  appendJournal(root, id, {actor: agent, kind: 'checkpoint', ref: /^S\d+/.exec(current ?? '')?.[0] ?? '-', text: next ? `дальше: ${next}` : state ?? 'контрольная точка'});
}

export function setStep(root, id, stepId, status, {agent, result, check}) {
  if (!STEP_STATUSES.includes(status)) throw new BridgeError('STEP_STATUS', `Статус шага: ${STEP_STATUSES.join(', ')}.`);
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
      if (!fieldText(step.fields[FIELD.result])) throw new BridgeError('RESULT_REQUIRED', 'У готового шага нужен итог: --result "коммит, проверки".');
    }
    if (status === 'dropped' && !fieldText(step.fields[FIELD.result])) throw new BridgeError('RESULT_REQUIRED', 'Укажите причину отмены: --result "…".');
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
  const stepId = mutateCard(root, id, card => appendStep(card, input));
  appendJournal(root, id, {actor: input.agent, kind: 'note', ref: stepId, text: `добавлен шаг: ${input.title}`});
  return stepId;
}

export function setStatus(root, id, status, {agent, note = ''}) {
  if (!TASK_STATUSES.includes(status)) throw new BridgeError('STATUS', `Статус задачи: ${TASK_STATUSES.join(', ')}.`);
  mutateCard(root, id, card => {
    card.meta.status = status;
    if (['review', 'done', 'cancelled', 'ready', 'draft'].includes(status)) {
      card.meta.holder = '';
      card.meta.lease = '';
    }
    if (status === 'active' && !card.meta.holder) {
      if (!agent) throw new BridgeError('AGENT_REQUIRED', 'Активной задаче нужен исполнитель: сначала bridge claim.');
      card.meta.holder = agent;
      card.meta.lease = leaseUntil(4);
    }
  });
  appendJournal(root, id, {actor: agent, kind: 'status', text: `${status}${note ? `: ${note}` : ''}`});
}

export function decide(root, id, text, {agent}) {
  const ref = mutateCard(root, id, card => {
    const n = nextEntryNumber(card, 'D');
    appendEntry(card, SECTION.decisions, `- **D${n}** (${isoSeconds(now()).slice(0, 10)}) ${oneLine(text)}`);
    return `D${n}`;
  });
  appendJournal(root, id, {actor: agent, kind: 'decision', ref, text});
  return ref;
}

export function ask(root, id, text, {agent, to = 'владелец'}) {
  const ref = mutateCard(root, id, card => {
    const n = nextEntryNumber(card, 'Q');
    appendEntry(card, SECTION.questions, `- **Q${n}** [open] ${oneLine(text)} → ${oneLine(to)}`);
    return `Q${n}`;
  });
  appendJournal(root, id, {actor: agent, kind: 'question', ref, text});
  return ref;
}

export function answer(root, id, questionId, text, {agent}) {
  mutateCard(root, id, card => answerQuestion(card, questionId, text));
  appendJournal(root, id, {actor: agent, kind: 'answer', ref: questionId.toUpperCase(), text});
}

export function note(root, id, text, {agent}) {
  withLock(root, id, () => appendJournal(root, id, {actor: agent, kind: 'note', text}));
}

export const HANDOFF_REASONS = ['planned', 'limit', 'error', 'auth', 'context', 'timeout', 'review', 'blocked'];

/**
 * Closes a session so another agent can continue. Everything recorded here is mechanical: when an agent hit a limit
 * it could not write a summary, so the card keeps its last checkpoint and gains the facts git can still tell.
 */
export function handoff(root, id, {agent, reason = 'planned', to = '', note: text = ''}) {
  if (!HANDOFF_REASONS.includes(reason)) throw new BridgeError('REASON', `Причина передачи: ${HANDOFF_REASONS.join(', ')}.`);
  const git = gitState(root);
  const at = isoSeconds(now());
  mutateCard(root, id, card => {
    const handoffSection = section(card, SECTION.handoff, {create: true});
    const existing = fieldText(field(handoffSection.lines, FIELD.uncommitted));
    // An agent that stopped normally described its own work in progress; an interrupted one could not.
    if (git && (reason !== 'planned' || !existing)) setField(handoffSection.lines, FIELD.uncommitted, `${describeDirty(git)} — снято автоматически ${at}`, [], HANDOFF_FIELDS);
    setField(handoffSection.lines, FIELD.reason, `${reason} — ${agent || 'unknown'}, ${at}${to ? `, передано ${to}` : ''}${text ? `: ${oneLine(text)}` : ''}`, [], HANDOFF_FIELDS);
    if (!card.meta.holder || !agent || card.meta.holder === agent) {
      card.meta.holder = '';
      card.meta.lease = '';
      if (card.meta.status === 'active') card.meta.status = reason === 'blocked' ? 'blocked' : 'ready';
    }
  });
  const record = {task: id, reason, from: agent || 'unknown', to, at, note: text, git: git && {branch: git.branch, sha: git.sha, dirty: git.dirty.length}};
  writeAtomic(join(paths(root).run(id), 'handoff.json'), `${JSON.stringify(record, null, 2)}\n`);
  appendJournal(root, id, {actor: agent, kind: 'handoff', text: `${reason}${to ? ` → ${to}` : ''}${git ? `; HEAD ${git.sha}; незакоммичено ${git.dirty.length}` : ''}${text ? `; ${text}` : ''}`});
  return record;
}

export function startReview(root, id, {reviewer, base}) {
  const card = loadCard(root, id);
  const baseRef = base || card.meta.base || 'main';
  const directory = paths(root).reviews(id);
  mkdirSync(directory, {recursive: true});
  const round = readdirSync(directory).filter(name => /^R\d+\.md$/.test(name)).length + 1;
  const reviewId = `R${round}`;
  const baseSha = mergeBase(root, baseRef) ?? '';
  writeAtomic(join(directory, `${reviewId}.md`), reviewTemplate({
    id: reviewId, task: id, reviewer: reviewer || 'unknown', round, base: baseSha ? shortSha(root, baseSha) : baseRef,
    head: shortSha(root, 'HEAD') ?? '', created: isoSeconds(now()),
  }));
  appendJournal(root, id, {actor: reviewer, kind: 'review', ref: reviewId, text: `начато ревью от ${baseRef}`});
  return {reviewId, file: join(directory, `${reviewId}.md`), baseRef, baseSha};
}
