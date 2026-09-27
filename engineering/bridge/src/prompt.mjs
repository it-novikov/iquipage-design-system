import {readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {renderBrief} from './brief.mjs';
import {diffStat, gitState, mergeBase} from './git.mjs';
import {readJournal} from './journal.mjs';
import {BRIDGE_HOME, bridgeCommand} from './operations.mjs';
import {loadCard, paths} from './store.mjs';

export function briefFor(root, id, {budget} = {}) {
  const card = loadCard(root, id);
  return renderBrief(card, {
    git: gitState(root, card.meta.base), journal: readJournal(root, id), cardPath: relative(root, paths(root).card(id)), ...(budget ? {budget} : {}),
  });
}

function protocol(root) {
  const command = bridgeCommand(root);
  return readFileSync(join(BRIDGE_HOME, 'PROTOCOL.md'), 'utf8').replace(/^`bridge` — это `[^`]+`/m, `\`bridge\` — это \`${command}\``);
}

/** Everything an author agent needs to start: the protocol, who it is, and the task brief. */
export function authorPrompt(root, id, {agent}) {
  return [
    `Вы — агент «${agent}». Работайте над задачей ${id} по протоколу моста ниже. Сначала сверьте карточку с состоянием репозитория, затем выполните claim.`,
    '',
    protocol(root),
    '',
    '---',
    '',
    briefFor(root, id),
  ].join('\n');
}

/** A review package: criteria from the card, the diff range and where to write findings. No author history. */
export function reviewerPrompt(root, id, {agent, reviewFile, baseRef}) {
  const card = loadCard(root, id);
  const base = mergeBase(root, baseRef) ?? baseRef;
  const command = bridgeCommand(root);
  return [
    `Вы — независимый ревьюер «${agent}» задачи ${id}. Вы не автор и не видели его сессию. Код не меняйте.`,
    '',
    `1. Прочитайте сводку ниже: цель, рамки и критерии приёмки — то, против чего вы проверяете.`,
    `2. Изучите изменения: \`git diff ${base.slice(0, 12)}...HEAD\` (сводка ниже). Читайте файлы целиком там, где нужно понять контекст.`,
    `3. Пройдите чек-лист из engineering/review.md по пунктам, которые относятся к изменению.`,
    `4. Запишите замечания в ${relative(root, reviewFile)} в формате: \`- **F1** [P1] \`путь:строка\` — суть.\` + строки «Сценарий:» и «Решение: [open]».`,
    `5. Заполните «Итог» и поле verdict в заголовке файла: approve или changes-requested. Укажите, что не проверили.`,
    `6. Завершите: \`${command} log ${id} "ревью ${relative(root, reviewFile)} готово"\`.`,
    '',
    '## Изменённые файлы',
    '```',
    diffStat(root, base) ?? 'git недоступен',
    '```',
    '',
    '---',
    '',
    renderBrief(card, {git: gitState(root, card.meta.base), journal: [], cardPath: relative(root, paths(root).card(id))}),
  ].join('\n');
}
