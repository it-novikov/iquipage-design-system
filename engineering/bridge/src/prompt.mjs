import {readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {renderBrief} from './brief.mjs';
import {diffStat, gitState, mergeBase} from './git.mjs';
import {readJournal} from './journal.mjs';
import {liveLease} from './lease.mjs';
import {BRIDGE_HOME, bridgeCommand} from './operations.mjs';
import {parseReview} from './review.mjs';
import {loadCard, paths} from './store.mjs';

export function briefFor(root, id, {budget} = {}) {
  const card = loadCard(root, id);
  return renderBrief(card, {
    git: gitState(root, card.meta.base), journal: readJournal(root, id), cardPath: relative(root, paths(root).card(id)),
    lease: liveLease(root, id), ...(budget ? {budget} : {}),
  });
}

/** The protocol with the real command path; it is short on purpose, since every author prompt carries it. */
function protocol(root) {
  const command = bridgeCommand(root);
  return readFileSync(join(BRIDGE_HOME, 'PROTOCOL.md'), 'utf8').replace(/^`bridge` — это `[^`]+`/m, `\`bridge\` — это \`${command}\``);
}

/** Everything an author agent needs to start: who it is, the protocol and the task brief. */
export function authorPrompt(root, id, {agent}) {
  return [
    `Вы — агент «${agent}». Задача ${id}. Имя агента для команд моста: \`export BRIDGE_AGENT=${agent}\`.`,
    '',
    protocol(root),
    '',
    '---',
    '',
    briefFor(root, id),
  ].join('\n');
}

/**
 * A review package: criteria from the card, the diff range and where to write findings. No author history.
 * With `previous`, the package is a follow-up round: the earlier findings and only the changes made since.
 */
export function reviewerPrompt(root, id, {agent, reviewFile, baseRef, previous = null}) {
  const card = loadCard(root, id);
  const base = mergeBase(root, baseRef) ?? baseRef;
  const command = bridgeCommand(root);
  const file = relative(root, reviewFile);
  const followUp = previous ? parseReview(readFileSync(previous.file, 'utf8')) : null;
  const lines = [
    `Вы — независимый ревьюер «${agent}» задачи ${id}. Вы не автор и не видели его сессию. Код не меняйте.`,
    '',
    '1. Прочитайте сводку ниже: цель, рамки и критерии приёмки — то, против чего вы проверяете.',
  ];
  if (followUp) {
    lines.push(
      `2. Это повторное ревью после ${previous.id}. Полностью проверьте исправления: \`git diff ${previous.head}..HEAD\`. Остальной код — выборочно, в окрестности исправлений.`,
      `3. Для каждого замечания ${previous.id} подтвердите решение автора или откройте его снова в своём файле с тем же текстом.`,
    );
  } else {
    lines.push(
      `2. Изучите изменения: \`git diff ${base.slice(0, 12)}...HEAD\` (сводка ниже). Файлы читайте целиком там, где нужен контекст.`,
      '3. Пройдите чек-лист из engineering/review.md по пунктам, которые относятся к изменению.',
    );
  }
  lines.push(
    `4. Запишите замечания в ${file}: \`- **F1** [P1] \`путь:строка\` — суть.\`, затем строки «Сценарий:» и «Решение: [open]».`,
    '5. Заполните «Итог» и поле verdict в заголовке файла: approve или changes-requested. Укажите, что не проверили.',
    `6. Завершите: \`BRIDGE_AGENT=${agent} ${command} log ${id} "ревью ${file} готово"\`.`,
    '',
  );
  if (followUp) {
    lines.push(`## Замечания ${previous.id}`, ...followUp.findings.map(finding => `- ${finding.id} [${finding.priority}] ${finding.resolution ?? 'open'} — ${finding.text}`), '');
    lines.push('## Изменено после прошлого ревью', '```', diffStat(root, previous.head, '..') ?? 'git недоступен', '```');
  } else {
    lines.push('## Изменённые файлы', '```', diffStat(root, base) ?? 'git недоступен', '```');
  }
  lines.push('', '---', '', renderBrief(card, {git: gitState(root, card.meta.base), journal: [], cardPath: relative(root, paths(root).card(id))}));
  return lines.join('\n');
}
