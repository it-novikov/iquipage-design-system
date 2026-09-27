import {readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {renderBrief} from './brief.mjs';
import {changedFiles, diffStat, diffStatOfFiles, gitState, isAncestor, mergeBase} from './git.mjs';
import {readJournal} from './journal.mjs';
import {liveLease} from './lease.mjs';
import {BRIDGE_HOME, bridgeCommand} from './operations.mjs';
import {parseReview} from './review.mjs';
import {loadCard, paths} from './store.mjs';

const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

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
    `Вы — агент «${agent}». Задача ${id}. Команды моста подписываются именем из BRIDGE_AGENT; если переменная не задана, выполните \`export BRIDGE_AGENT=${agent}\`.`,
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
export function reviewerPrompt(root, id, {agent, reviewFile, baseRef, previous = []}) {
  const card = loadCard(root, id);
  const base = mergeBase(root, baseRef) ?? baseRef;
  const command = bridgeCommand(root);
  const file = relative(root, reviewFile);
  const followUp = previous.length ? previous.map(item => ({...item, review: parseReview(readFileSync(item.file, 'utf8'))})) : null;
  const names = previous.map(item => item.id).join(', ');
  // All reviews of one round share a head; the oldest one bounds the changes made since.
  const since = previous[0]?.head;
  // After a rebase the reviewed commit is no longer an ancestor: compare content, limited to the task's own files.
  const rewritten = Boolean(since) && !isAncestor(root, since);
  const taskFiles = changedFiles(root, baseRef);
  const lines = [
    `Вы — независимый ревьюер «${agent}» задачи ${id}. Вы не автор и не видели его сессию. Код не меняйте.`,
    '',
    '1. Прочитайте сводку ниже: цель, рамки и критерии приёмки — то, против чего вы проверяете.',
  ];
  if (followUp) {
    lines.push(
      rewritten
        ? `2. Это повторное ревью после ${names}. История переписана после прошлого ревью (${since} не предок HEAD), поэтому сравнение идёт по содержимому файлов задачи: \`git diff ${since} HEAD -- <файлы ниже>\`. Исправления проверьте полностью, остальное — выборочно.`
        : `2. Это повторное ревью после ${names}. Полностью проверьте исправления: \`git diff ${since}..HEAD\`. Остальной код — выборочно, в окрестности исправлений.`,
      `3. Для каждого замечания ${names} подтвердите решение автора или откройте его снова в своём файле. Перенесённые (deferred) проверьте на обоснованность.`,
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
    for (const item of followUp) {
      lines.push(`## Замечания ${item.id}`, ...item.review.findings.map(finding => `- ${finding.id} [${finding.priority}] ${finding.resolution ?? 'open'} — ${clip(finding.text, 180)}`), '');
    }
    const stat = rewritten ? diffStatOfFiles(root, since, taskFiles) : diffStat(root, since, '..');
    lines.push('## Изменено после прошлого ревью', '```', stat ?? 'git недоступен', '```');
  } else {
    lines.push('## Изменённые файлы', '```', diffStat(root, base) ?? 'git недоступен', '```');
  }
  lines.push('', '---', '', renderBrief(card, {git: gitState(root, card.meta.base), journal: [], cardPath: relative(root, paths(root).card(id))}));
  return lines.join('\n');
}
