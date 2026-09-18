/** Shared pure utilities. Never interprets strings as HTML, code or expressions. */
export const clone = value => structuredClone(value);
export const uid = (prefix = 'item') => `${prefix}-${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'DomainError'; this.code = code; this.details = details;
  }
}
export function requireValue(condition, code, message) {
  if (!condition) throw new DomainError(code, message);
}
export const validText = (value, max = 10000) => typeof value === 'string' && value.length <= max;
export const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
export function assertSafeJSON(value, depth = 0) {
  requireValue(depth < 40, 'INVALID_DATA', 'Слишком глубокая структура данных.');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), 'INVALID_NUMBER', 'Число должно быть конечным.'); return;
  }
  requireValue(typeof value === 'object', 'INVALID_DATA', 'Нужны JSON-совместимые данные.');
  for (const [key, item] of Object.entries(value)) {
    requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_KEY', 'Недопустимое поле документа.');
    if (item !== undefined) assertSafeJSON(item, depth + 1);
  }
}
