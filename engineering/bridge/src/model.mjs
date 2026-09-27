import {FIELD, SECTION, field, fieldText, parseDecisions, parseQuestions, parseSteps, section} from './card.mjs';

const bullets = text => text.split('\n').map(line => line.replace(/^- /, '').trim()).filter(Boolean);

function sectionText(card, name) {
  return (section(card, name)?.lines ?? []).join('\n').trim();
}

/**
 * The card as data: the interchange shape described by schema/task.v1.schema.json. Sprintique's task work plan API
 * uses the same shape, so a card can move between a repository and the platform without translation.
 */
export function toModel(card) {
  const scope = section(card, SECTION.scope)?.lines ?? [];
  const handoff = section(card, SECTION.handoff)?.lines ?? [];
  const text = (lines, label) => fieldText(field(lines, label));
  return {
    format: 'bridge/1',
    id: card.meta.id,
    title: card.title ?? card.meta.title,
    status: card.meta.status,
    risk: card.meta.risk,
    owner: card.meta.owner || null,
    holder: card.meta.holder || null,
    lease: card.meta.lease || null,
    branch: card.meta.branch || null,
    base: card.meta.base || null,
    created: card.meta.created,
    updated: card.meta.updated,
    links: card.meta.links ?? [],
    goal: sectionText(card, SECTION.goal),
    scope: {included: text(scope, FIELD.included), excluded: text(scope, FIELD.excluded), constraints: text(scope, FIELD.constraints)},
    handoff: {
      state: text(handoff, FIELD.state), current: text(handoff, FIELD.now), next: text(handoff, FIELD.next),
      uncommitted: text(handoff, FIELD.uncommitted), traps: bullets(text(handoff, FIELD.traps)), verify: text(handoff, FIELD.verify),
      reason: text(handoff, FIELD.reason),
    },
    steps: parseSteps(card).map(step => ({
      id: step.id, title: step.title, status: step.status,
      what: fieldText(step.fields[FIELD.what]), how: fieldText(step.fields[FIELD.how]), why: fieldText(step.fields[FIELD.why]),
      criteria: step.criteria, result: fieldText(step.fields[FIELD.result]) || null,
      dependsOn: fieldText(step.fields[FIELD.dependsOn]).split(/[,\s]+/).filter(Boolean), model: fieldText(step.fields[FIELD.model]) || null,
    })),
    decisions: parseDecisions(card).map(decision => {
      const dated = /^\((\d{4}-\d{2}-\d{2})\) (.*)$/.exec(decision.text);
      return {id: decision.id, date: dated?.[1] ?? null, text: dated?.[2] ?? decision.text};
    }),
    questions: parseQuestions(card).map(question => {
      const lines = section(card, SECTION.questions).lines;
      let end = question.index + 1;
      while (end < lines.length && lines[end].startsWith('  ')) end++;
      const answer = lines.slice(question.index + 1, end).map(line => /^ {2}Ответ: (.*)$/.exec(line)?.[1]).find(Boolean) ?? null;
      const [body, to = null] = question.text.split(' → ');
      return {id: question.id, status: question.status, text: body, to, answer};
    }),
    context: bullets(sectionText(card, SECTION.context)),
  };
}
