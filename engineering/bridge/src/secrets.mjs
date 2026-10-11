import {BridgeError} from './errors.mjs';

// Patterns that look like credentials. A card is shared with every agent and lands in git, so a match is an error,
// both when a command writes text and when `bridge check` reads a card edited by hand.
const PATTERNS = [
  ['токен Sprintique', /\b(?:spk|spr)_[A-Za-z0-9_-]{20,}/],
  ['приватный ключ', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['ключ AWS', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['токен GitHub', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['ключ Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['ключ API', /\b(sk|rk|pk)-(proj-|live_|test_)?[A-Za-z0-9_-]{20,}/],
  ['ключ Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['токен Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['токен Bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/],
  ['пароль в URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
  ['секрет в переменной', /\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*=\s*["']?[^\s"'`$]{8,}/],
  ['секрет в присваивании', /(^|[^A-Za-z0-9])(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["']?[^\s"'`$]{8,}/i],
  ['cookie сессии', /\b__Host-[a-z-]+=[A-Za-z0-9_-]{20,}/],
];

/** Returns human-readable findings with line numbers; the matched value itself is never echoed. */
export function findSecrets(text) {
  const findings = [];
  String(text).split('\n').forEach((line, index) => {
    for (const [name, pattern] of PATTERNS) if (pattern.test(line)) findings.push({line: index + 1, name});
  });
  return findings;
}

/** Refuses text before it is written into a card or journal. */
export function requireNoSecrets(...texts) {
  for (const text of texts) {
    if (text === undefined || text === null) continue;
    const [finding] = findSecrets(text);
    if (finding) throw new BridgeError('SECRET_LIKE_CONTENT', `Текст похож на ${finding.name}. Карточку читают все агенты и она попадает в git: уберите значение.`);
  }
}
