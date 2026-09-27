import {parseFrontmatter, splitFrontmatter} from './frontmatter.mjs';

export const VERDICTS = ['pending', 'approve', 'changes-requested'];
const FINDING = /^- \*\*F(\d+)\*\* \[(P[0-3])\] (.*)$/;
const RESOLUTION = /^ {2}Решение: \[(open|fixed|deferred|rejected)\b[^\]]*\]/;

export function parseReview(text) {
  const {raw, body} = splitFrontmatter(text.replace(/\r\n/g, '\n'));
  const meta = raw === null ? {} : parseFrontmatter(raw).data;
  const findings = [];
  let current = null;
  for (const line of body.split('\n')) {
    const match = FINDING.exec(line);
    if (match) {
      current = {id: `F${match[1]}`, priority: match[2], text: match[3], resolution: null};
      findings.push(current);
      continue;
    }
    const resolution = current && RESOLUTION.exec(line);
    if (resolution) current.resolution = resolution[1];
    else if (!line.startsWith('  ')) current = null;
  }
  return {meta, findings};
}

/** A finding without an explicit resolution counts as open. */
export const isOpen = finding => finding.resolution === null || finding.resolution === 'open';
export const isBlocking = finding => isOpen(finding) && (finding.priority === 'P0' || finding.priority === 'P1');

export function reviewTemplate({id, task, reviewer, round, base, head, created}) {
  return `---
bridge-review: 1
id: ${id}
task: ${task}
reviewer: ${reviewer}
round: ${round}
base: ${base}
head: ${head}
created: ${created}
verdict: pending
---
# Ревью ${id}

## Замечания

## Итог
- **Вердикт:** pending
- **Проверено:**
- **Не проверено:**
`;
}
