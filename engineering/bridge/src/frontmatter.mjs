import {BridgeError} from './errors.mjs';

// A deliberately small YAML subset: `key: scalar`, `key: [a, b]` and `key:` followed by `  - item` lines.
// Anything richer is rejected, so a card never depends on a YAML library's interpretation.
const KEY = /^([a-z][a-z0-9-]*):(?:[ \t]+(.*))?$/;
const ITEM = /^[ \t]+-[ \t]+(.*)$/;

export function splitFrontmatter(text) {
  if (!text.startsWith('---\n')) return {raw: null, body: text};
  const end = text.indexOf('\n---\n', 3);
  if (end < 0) throw new BridgeError('FRONTMATTER', 'Заголовок карточки не закрыт строкой ---.');
  return {raw: text.slice(4, end + 1), body: text.slice(end + 5)};
}

function parseScalar(value) {
  const text = value.trim();
  if (text === '' || text === '~' || text === 'null') return '';
  if (text.startsWith('"')) {
    try { return JSON.parse(text); } catch { throw new BridgeError('FRONTMATTER', `Некорректная строка в кавычках: ${text}`); }
  }
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

export function parseFrontmatter(raw) {
  const data = {}, order = [];
  let listKey = null;
  for (const [index, line] of raw.split('\n').entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const item = ITEM.exec(line);
    if (item) {
      if (!listKey) throw new BridgeError('FRONTMATTER', `Строка ${index + 1}: элемент списка без ключа.`);
      data[listKey].push(String(parseScalar(item[1])));
      continue;
    }
    const pair = KEY.exec(line);
    if (!pair) throw new BridgeError('FRONTMATTER', `Строка ${index + 1}: ожидается «ключ: значение».`);
    const [, key, value = ''] = pair;
    if (Object.hasOwn(data, key)) throw new BridgeError('FRONTMATTER', `Ключ ${key} повторяется.`);
    order.push(key);
    listKey = null;
    if (value.trim().startsWith('[')) {
      const inner = value.trim();
      if (!inner.endsWith(']')) throw new BridgeError('FRONTMATTER', `Ключ ${key}: список не закрыт.`);
      data[key] = inner.slice(1, -1).split(',').map(part => String(parseScalar(part))).filter(Boolean);
    } else if (value.trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(value);
    }
  }
  // `key:` with no items is an empty scalar, not an empty list.
  for (const key of order) if (Array.isArray(data[key]) && data[key].length === 0 && !LIST_KEYS.has(key)) data[key] = '';
  return {data, order};
}

/** Keys that are always lists, even when empty. */
export const LIST_KEYS = new Set(['links', 'tags']);

function renderScalar(value) {
  const text = String(value);
  if (typeof value === 'number') return text;
  const quoted = text === '' ? false
    : /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(text) || /:\s|\s#|\s$|:$/.test(text) || /^(true|false|null|~|-?\d+(\.\d+)?)$/.test(text) || /[\n\r]/.test(text);
  return quoted ? JSON.stringify(text) : text;
}

export function renderFrontmatter(data, order) {
  const keys = [...order.filter(key => Object.hasOwn(data, key)), ...Object.keys(data).filter(key => !order.includes(key))];
  const lines = [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${renderScalar(item)}`);
    } else if (value === '' || value === null || value === undefined) {
      lines.push(`${key}:`);
    } else {
      lines.push(`${key}: ${renderScalar(value)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n`;
}
