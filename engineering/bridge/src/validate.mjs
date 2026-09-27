import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {FIELD, FORMAT_VERSION, RISKS, SECTION, SECTION_ORDER, STEP_STATUSES, TASK_STATUSES, field, fieldText, parseAcceptance, parseCard, parseQuestions, parseSteps, section, stepCovers} from './card.mjs';
import {changedFiles} from './git.mjs';
import {findSecrets} from './secrets.mjs';
import {isBlocking, parseReview, VERDICTS} from './review.mjs';
import {loadConfig, paths} from './store.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Checks one task directory. Returns {errors, warnings}; each item is a short sentence. */
export function validateTask(root, id) {
  const errors = [], warnings = [];
  const file = paths(root).card(id);
  const text = readFileSync(file, 'utf8');
  let card;
  try {
    card = parseCard(text);
  } catch (error) {
    return {errors: [error.message], warnings};
  }
  const meta = card.meta;
  if (meta.bridge !== FORMAT_VERSION) errors.push(`bridge: ожидается ${FORMAT_VERSION}.`);
  for (const key of ['id', 'title', 'status', 'risk', 'owner', 'created', 'updated']) if (!meta[key]) errors.push(`В заголовке нет поля ${key}.`);
  if (meta.id && meta.id !== id) errors.push(`id «${meta.id}» не совпадает с каталогом ${id}.`);
  if (meta.status && !TASK_STATUSES.includes(meta.status)) errors.push(`status «${meta.status}» не из списка: ${TASK_STATUSES.join(', ')}.`);
  if (meta.risk && !RISKS.includes(meta.risk)) errors.push(`risk «${meta.risk}» не из списка: ${RISKS.join(', ')}.`);
  if (meta.created && !ISO_DATE.test(String(meta.created))) errors.push('created — дата вида 2026-09-27.');
  if (meta.updated && !ISO_TIME.test(String(meta.updated))) errors.push('updated — время UTC вида 2026-09-27T10:00:00Z.');
  if (meta.links !== undefined && !Array.isArray(meta.links)) errors.push('links — список.');
  if (meta.holder !== undefined || meta.lease !== undefined) warnings.push('Поля holder и lease в карточке устарели: аренда хранится вне рабочего каталога. Удалите их.');

  if (card.title === null) errors.push('Нет заголовка «# …».');
  if (card.title !== null && meta.title && card.title !== meta.title) errors.push('Название в title: и в заголовке «# …» различается.');
  const names = card.sections.map(item => item.name);
  for (const name of SECTION_ORDER) {
    // The task acceptance section is new in format 1; a card without it is valid but warned.
    if (!names.includes(name)) (name === SECTION.acceptance ? warnings : errors).push(`Нет раздела «## ${name}».`);
  }
  for (const name of names) if (!SECTION_ORDER.includes(name)) warnings.push(`Неизвестный раздел «## ${name}»: проверьте, не начат ли он внутри блока кода.`);
  const known = names.filter(name => SECTION_ORDER.includes(name));
  if (known.some((name, index) => index > 0 && SECTION_ORDER.indexOf(name) < SECTION_ORDER.indexOf(known[index - 1]))) {
    errors.push(`Разделы идут не по порядку: ${SECTION_ORDER.join(' → ')}.`);
  }
  const goal = section(card, SECTION.goal);
  if (goal && !goal.lines.some(line => line.trim())) errors.push('Раздел «Цель» пуст.');
  if (meta.status !== 'draft' && /Какая проблема, у кого и какой проверяемый результат нужен|\*\*(Входит|Не входит|Ограничения):\*\* …$/m.test(text)) {
    warnings.push('В карточке остался текст шаблона: заполните «Цель» и «Рамки».');
  }

  const handoff = section(card, SECTION.handoff);
  if (handoff && !['draft', 'done', 'cancelled'].includes(meta.status)) {
    for (const label of [FIELD.state, FIELD.next]) if (!fieldText(field(handoff.lines, label))) errors.push(`В «Передаче» не заполнено «${label}».`);
  }
  if (handoff && handoff.lines.filter(line => line.trim()).length > 25) warnings.push('«Передача» длиннее 25 строк: оставьте только текущее состояние.');

  const steps = parseSteps(card);
  const seen = new Set();
  for (const step of steps) {
    const label = `${step.id} «${step.title}»`;
    if (seen.has(step.id)) errors.push(`${step.id} повторяется.`);
    seen.add(step.id);
    if (!STEP_STATUSES.includes(step.status)) errors.push(`${label}: статус «${step.status}» не из списка: ${STEP_STATUSES.join(', ')}.`);
    for (const required of [FIELD.what, FIELD.how, FIELD.why]) if (!fieldText(step.fields[required])) errors.push(`${label}: не заполнено «${required}».`);
    if (!step.criteria.length) errors.push(`${label}: нет критериев приёмки.`);
    if (step.status === 'done') {
      if (step.criteria.some(item => !item.done)) errors.push(`${label}: шаг готов, но не все критерии отмечены.`);
      if (!fieldText(step.fields[FIELD.result])) errors.push(`${label}: у готового шага нет «Итога».`);
    }
    if (step.status === 'dropped' && !fieldText(step.fields[FIELD.result])) errors.push(`${label}: у отменённого шага нет «Итога» с причиной.`);
  }
  if (!['draft', 'cancelled'].includes(meta.status) && !steps.length) errors.push('В плане нет шагов.');
  const acceptance = parseAcceptance(card);
  const ids = new Set(acceptance.map(item => item.id));
  const covered = new Set(steps.filter(step => step.status !== 'dropped').flatMap(stepCovers));
  for (const step of steps) for (const reference of stepCovers(step)) if (!ids.has(reference)) errors.push(`${step.id}: покрывает несуществующий критерий ${reference}.`);
  const uncovered = acceptance.filter(item => !covered.has(item.id)).map(item => item.id);
  if (uncovered.length) (meta.status === 'draft' ? warnings : errors).push(`Критерии приёмки без шага: ${uncovered.join(', ')}.`);
  if (!acceptance.length && !['draft', 'cancelled'].includes(meta.status) && names.includes(SECTION.acceptance)) warnings.push('У задачи нет критериев приёмки.');
  if (steps.filter(step => step.status === 'active').length > 1) warnings.push('Активно больше одного шага.');

  const reviewsDirectory = paths(root).reviews(id);
  const reviews = existsSync(reviewsDirectory) ? readdirSync(reviewsDirectory).filter(name => /^R\d+\.md$/.test(name)) : [];
  let blocking = 0;
  for (const name of reviews) {
    const reviewText = readFileSync(join(reviewsDirectory, name), 'utf8');
    const review = parseReview(reviewText);
    if (review.meta.verdict && !VERDICTS.includes(review.meta.verdict)) errors.push(`${name}: verdict «${review.meta.verdict}» не из списка.`);
    blocking += review.findings.filter(isBlocking).length;
    for (const finding of findSecrets(reviewText)) errors.push(`${name}:${finding.line}: похоже на ${finding.name}.`);
  }
  if (meta.status === 'done') {
    const unfinished = steps.filter(step => !['done', 'dropped'].includes(step.status));
    if (unfinished.length) errors.push(`Задача готова, но шаги не завершены: ${unfinished.map(step => step.id).join(', ')}.`);
    const unmet = acceptance.filter(item => !item.done);
    if (unmet.length) errors.push(`Задача готова, но не выполнены критерии: ${unmet.map(item => item.id).join(', ')}.`);
    if (blocking) errors.push(`Задача готова, но в ревью открыто P0/P1: ${blocking}.`);
  }
  const floor = riskFloor(root, meta);
  if (floor && RISKS.indexOf(floor.risk) > RISKS.indexOf(meta.risk)) errors.push(`Изменения ${floor.file} требуют уровня риска ${floor.risk}, в карточке ${meta.risk}. Понизить уровень может только владелец.`);
  if (meta.status === 'review' && blocking) warnings.push(`В ревью открыто P0/P1: ${blocking}.`);
  if (['review', 'done'].includes(meta.status) && parseQuestions(card).some(item => item.status === 'open')) warnings.push('Есть открытые вопросы.');

  for (const finding of findSecrets(text)) errors.push(`task.md:${finding.line}: похоже на ${finding.name}. Уберите значение.`);
  const journal = paths(root).journal(id);
  if (existsSync(journal)) for (const finding of findSecrets(readFileSync(journal, 'utf8'))) errors.push(`journal.md:${finding.line}: похоже на ${finding.name}.`);
  if (text.split('\n').length > 600) warnings.push('Карточка длиннее 600 строк: вынесите подробности в документы и оставьте ссылки.');
  return {errors, warnings};
}

/**
 * The lowest risk level the changed files allow, from `riskFloor` in .bridge/config.json: a list of
 * `{"pattern": "<regex over the path>", "risk": "high"}`. Only a card with a branch and a base is checked.
 */
export function riskFloor(root, meta) {
  const rules = (loadConfig(root).riskFloor ?? []).map(rule => ({...rule, regex: new RegExp(rule.pattern)}));
  if (!rules.length || !meta.base || !['active', 'ready', 'review', 'done'].includes(meta.status)) return null;
  let strongest = null;
  for (const file of changedFiles(root, meta.base)) {
    for (const rule of rules) {
      if (rule.regex.test(file) && (!strongest || RISKS.indexOf(rule.risk) > RISKS.indexOf(strongest.risk))) strongest = {risk: rule.risk, file};
    }
  }
  return strongest;
}
