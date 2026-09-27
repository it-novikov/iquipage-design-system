// Patterns that look like credentials. A card is shared with every agent and lands in git, so a match is an error.
const PATTERNS = [
  ['приватный ключ', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['ключ AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['токен GitHub', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['ключ API', /\b(sk|rk|pk)[-_](live|test|ant|proj)?[-_]?[A-Za-z0-9]{20,}\b/],
  ['токен Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['пароль в URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
  ['секрет в присваивании', /\b(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["']?[^\s"'`]{8,}/i],
  ['cookie сессии', /\b__Host-[a-z-]+=[A-Za-z0-9_-]{20,}/],
];

/** Returns human-readable findings with line numbers; the matched value itself is never echoed. */
export function findSecrets(text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of PATTERNS) if (pattern.test(line)) findings.push({line: index + 1, name});
  });
  return findings;
}
