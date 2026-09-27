import {BridgeError} from './errors.mjs';
import {parseFrontmatter, renderFrontmatter, splitFrontmatter} from './frontmatter.mjs';

export const FORMAT_VERSION = 1;
export const TASK_STATUSES = ['draft', 'ready', 'active', 'blocked', 'review', 'done', 'cancelled'];
export const STEP_STATUSES = ['todo', 'active', 'done', 'blocked', 'dropped'];
export const RISKS = ['low', 'standard', 'high'];
export const META_ORDER = ['bridge', 'id', 'title', 'status', 'risk', 'owner', 'holder', 'lease', 'branch', 'base', 'created', 'updated', 'links'];

export const SECTION = {
  goal: 'Цель', scope: 'Рамки', handoff: 'Передача', plan: 'План', decisions: 'Решения', questions: 'Вопросы', context: 'Контекст',
};
export const SECTION_ORDER = [SECTION.goal, SECTION.scope, SECTION.handoff, SECTION.plan, SECTION.decisions, SECTION.questions, SECTION.context];
export const FIELD = {
  included: 'Входит', excluded: 'Не входит', constraints: 'Ограничения',
  state: 'Состояние', now: 'Сейчас', next: 'Дальше', uncommitted: 'Незакоммичено', traps: 'Ловушки', verify: 'Проверка', reason: 'Причина',
  what: 'Что', how: 'Как', why: 'Зачем', accept: 'Приёмка', result: 'Итог', dependsOn: 'Зависит от', model: 'Модель',
};
export const HANDOFF_FIELDS = [FIELD.state, FIELD.now, FIELD.next, FIELD.uncommitted, FIELD.traps, FIELD.verify, FIELD.reason];
const STEP_FIELDS = [FIELD.what, FIELD.how, FIELD.why, FIELD.accept, FIELD.result, FIELD.dependsOn, FIELD.model];

const FIELD_LINE = /^- \*\*(.+?):\*\*(?: (.*))?$/;
const STEP_HEADING = /^### S(\d+)\. (.+?) \[([a-z]+)\]\s*$/;
const CRITERION = /^ {2}- \[( |x|X)\] (.*)$/;

// ---------------------------------------------------------------------------------------------------------------
// Card: the body is kept as lines so an unchanged card renders byte for byte. Mutations touch only the lines they own.

export function parseCard(text) {
  const {raw, body} = splitFrontmatter(text.replace(/\r\n/g, '\n'));
  if (raw === null) throw new BridgeError('FRONTMATTER', 'У карточки нет заголовка между строками ---.');
  const {data: meta, order} = parseFrontmatter(raw);
  const lines = body.split('\n');
  const card = {meta, metaOrder: order, pre: [], title: null, titlePre: [], sections: []};
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = {name: line.slice(3).trim(), lines: []};
      card.sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (card.title === null && line.startsWith('# ')) {
      card.title = line.slice(2).trim();
    } else if (card.title === null) {
      card.pre.push(line);
    } else {
      card.titlePre.push(line);
    }
  }
  return card;
}

export function renderCard(card) {
  const parts = [renderFrontmatter(card.meta, [...new Set([...META_ORDER, ...card.metaOrder])]).trimEnd(), ...card.pre];
  if (card.title !== null) parts.push(`# ${card.title}`, ...card.titlePre);
  for (const section of card.sections) parts.push(`## ${section.name}`, ...section.lines);
  return parts.join('\n');
}

export function section(card, name, {create = false} = {}) {
  let found = card.sections.find(item => item.name === name);
  if (!found && create) {
    found = {name, lines: ['', '']};
    const rank = SECTION_ORDER.indexOf(name);
    const at = card.sections.findIndex(item => SECTION_ORDER.indexOf(item.name) > rank || SECTION_ORDER.indexOf(item.name) < 0);
    if (at < 0) {
      const last = card.sections.at(-1);
      if (last && last.lines.at(-1) !== '') last.lines.push('');
      card.sections.push(found);
    } else {
      card.sections.splice(at, 0, found);
    }
  }
  return found ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Fields: `- **Label:** value` with continuation lines indented by two spaces.

export function parseFields(lines) {
  const fields = [];
  for (let index = 0; index < lines.length; index++) {
    const match = FIELD_LINE.exec(lines[index]);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    fields.push({label: match[1], value: (match[2] ?? '').trim(), extra: lines.slice(index + 1, end), start: index, end});
    index = end - 1;
  }
  return fields;
}

export function field(lines, label) {
  return parseFields(lines).find(item => item.label === label) ?? null;
}

/** Full text of a field: the inline value followed by its continuation lines, without the indentation. */
export function fieldText(item) {
  if (!item) return '';
  return [item.value, ...item.extra.map(line => line.slice(2))].filter(line => line.trim() !== '').join('\n');
}

function fieldLines(label, value, extra) {
  return [value ? `- **${label}:** ${value}` : `- **${label}:**`, ...extra];
}

/** Replaces or inserts a field. `order` lists the labels of this block so a new field lands in its place. */
export function setField(lines, label, value, extra = [], order = []) {
  const fields = parseFields(lines);
  const existing = fields.find(item => item.label === label);
  const replacement = fieldLines(label, oneLine(value), extra);
  if (existing) {
    lines.splice(existing.start, existing.end - existing.start, ...replacement);
    return;
  }
  const rank = order.indexOf(label);
  const after = fields.filter(item => rank < 0 || order.indexOf(item.label) < 0 || order.indexOf(item.label) < rank).at(-1);
  const before = fields.find(item => rank >= 0 && order.indexOf(item.label) > rank);
  const at = before ? before.start : after ? after.end : firstContentLine(lines);
  lines.splice(at, 0, ...replacement);
}

/** Appends one bullet under a field, turning an inline value into the first bullet. */
export function appendFieldItem(lines, label, text, order = []) {
  const existing = field(lines, label);
  const items = existing ? [...existing.extra] : [];
  const inline = existing?.value ?? '';
  if (inline && !/^(нет|—|-)$/i.test(inline)) items.unshift(`  - ${inline}`);
  items.push(`  - ${oneLine(text)}`);
  setField(lines, label, '', items, order);
}

function firstContentLine(lines) {
  // Insert after the leading blank line of a section, before trailing blank lines.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return end === 0 ? Math.min(1, lines.length) : end;
}

export function oneLine(text) {
  return String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Plan steps.

export function parseSteps(card) {
  const plan = section(card, SECTION.plan);
  if (!plan) return [];
  const steps = [];
  let current = null;
  plan.lines.forEach((line, index) => {
    const match = STEP_HEADING.exec(line);
    if (match) {
      current = {n: Number(match[1]), id: `S${match[1]}`, title: match[2], status: match[3], start: index, end: plan.lines.length};
      if (steps.length) steps.at(-1).end = index;
      steps.push(current);
    } else if (line.startsWith('### ') && current) {
      current.end = index;
      current = null;
    }
  });
  for (const step of steps) {
    step.lines = plan.lines.slice(step.start + 1, step.end);
    step.fields = Object.fromEntries(parseFields(step.lines).map(item => [item.label, item]));
    step.criteria = (step.fields[FIELD.accept]?.extra ?? []).map(line => CRITERION.exec(line)).filter(Boolean)
      .map(match => ({done: match[1] !== ' ', text: match[2]}));
  }
  return steps;
}

export function findStep(card, id) {
  const step = parseSteps(card).find(item => item.id === id.toUpperCase());
  if (!step) throw new BridgeError('STEP_NOT_FOUND', `Шаг ${id} не найден.`);
  return step;
}

/** Rewrites one step through a callback that edits its heading data and body lines in place. */
export function updateStep(card, id, edit) {
  const plan = section(card, SECTION.plan);
  const step = findStep(card, id);
  const body = plan.lines.slice(step.start + 1, step.end);
  const heading = {title: step.title, status: step.status};
  edit(heading, body);
  plan.lines.splice(step.start, step.end - step.start, `### ${step.id}. ${heading.title} [${heading.status}]`, ...body);
}

export function setStepField(body, label, value, extra = []) {
  setField(body, label, value, extra, STEP_FIELDS);
}

export function checkCriteria(body, which) {
  const accept = field(body, FIELD.accept);
  if (!accept) throw new BridgeError('NO_CRITERIA', 'У шага нет раздела «Приёмка».');
  let number = 0;
  const extra = accept.extra.map(line => {
    const match = CRITERION.exec(line);
    if (!match) return line;
    number++;
    return which === 'all' || which.includes(number) ? `  - [x] ${match[2]}` : line;
  });
  setStepField(body, FIELD.accept, accept.value, extra);
}

export function renderStep({n, title, status = 'todo', what, how, why, accept = [], dependsOn = '', model = ''}) {
  const lines = [`### S${n}. ${oneLine(title)} [${status}]`, `- **${FIELD.what}:** ${oneLine(what)}`, `- **${FIELD.how}:** ${oneLine(how)}`,
    `- **${FIELD.why}:** ${oneLine(why)}`, `- **${FIELD.accept}:**`, ...accept.map(text => `  - [ ] ${oneLine(text)}`)];
  if (dependsOn) lines.push(`- **${FIELD.dependsOn}:** ${oneLine(dependsOn)}`);
  if (model) lines.push(`- **${FIELD.model}:** ${oneLine(model)}`);
  return lines;
}

export function appendStep(card, input) {
  const plan = section(card, SECTION.plan, {create: true});
  const n = Math.max(0, ...parseSteps(card).map(step => step.n)) + 1;
  let end = plan.lines.length;
  while (end > 0 && plan.lines[end - 1].trim() === '') end--;
  const block = renderStep({...input, n});
  // Keep one blank line between the heading or the previous step and the new step.
  if (end === 0 && plan.lines[0] === '') plan.lines.splice(1, 0, ...block);
  else plan.lines.splice(end, 0, '', ...block);
  if (plan.lines.at(-1) !== '') plan.lines.push('');
  return `S${n}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Numbered entries: decisions (`- **D1** …`) and questions (`- **Q1** [open] …`).

export function nextEntryNumber(card, prefix) {
  const target = section(card, prefix === 'D' ? SECTION.decisions : SECTION.questions);
  const pattern = new RegExp(`^- \\*\\*${prefix}(\\d+)\\*\\*`);
  return Math.max(0, ...(target?.lines ?? []).map(line => Number(pattern.exec(line)?.[1] ?? 0))) + 1;
}

export function appendEntry(card, sectionName, line) {
  const target = section(card, sectionName, {create: true});
  let end = target.lines.length;
  while (end > 0 && target.lines[end - 1].trim() === '') end--;
  // A section that only holds a placeholder line such as "Пока нет." gets the entry instead.
  if (end > 0 && !target.lines.slice(0, end).some(item => item.startsWith('- '))) {
    const placeholder = target.lines.findIndex(item => item.trim() !== '');
    if (placeholder >= 0 && placeholder < end && /^(пока нет|нет)\.?$/i.test(target.lines[placeholder].trim())) {
      target.lines.splice(placeholder, 1);
      end--;
    }
  }
  target.lines.splice(end, 0, line);
  if (target.lines.at(-1) !== '') target.lines.push('');
}

export function parseQuestions(card) {
  return (section(card, SECTION.questions)?.lines ?? []).map((line, index) => {
    const match = /^- \*\*Q(\d+)\*\* \[(open|answered)\] (.*)$/.exec(line);
    return match ? {id: `Q${match[1]}`, status: match[2], text: match[3], index} : null;
  }).filter(Boolean);
}

export function parseDecisions(card) {
  return (section(card, SECTION.decisions)?.lines ?? []).map(line => /^- \*\*(D\d+)\*\* (.*)$/.exec(line))
    .filter(Boolean).map(match => ({id: match[1], text: match[2]}));
}

export function answerQuestion(card, id, text) {
  const questions = section(card, SECTION.questions);
  const question = parseQuestions(card).find(item => item.id === id.toUpperCase());
  if (!question) throw new BridgeError('QUESTION_NOT_FOUND', `Вопрос ${id} не найден.`);
  questions.lines[question.index] = questions.lines[question.index].replace('[open]', '[answered]');
  let end = question.index + 1;
  while (end < questions.lines.length && questions.lines[end].startsWith('  ')) end++;
  questions.lines.splice(end, 0, `  Ответ: ${oneLine(text)}`);
}
