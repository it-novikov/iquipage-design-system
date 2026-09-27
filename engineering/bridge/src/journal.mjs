import {appendFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {isoSeconds, now, paths} from './store.mjs';
import {oneLine} from './card.mjs';

export const ENTRY_KINDS = ['create', 'claim', 'release', 'checkpoint', 'step', 'status', 'decision', 'question', 'answer', 'handoff', 'trigger', 'review', 'note'];
const ENTRY = /^- (\S+) · (.+?) · ([a-z]+) · (\S+) · (.*)$/;

export function appendJournal(root, id, {actor, kind, ref = '-', text}) {
  const file = paths(root).journal(id);
  mkdirSync(dirname(file), {recursive: true});
  const header = existsSync(file) ? '' : `# Журнал ${id}\n\n`;
  const who = oneLine(actor || 'unknown').replace(/ · /g, ' ');
  appendFileSync(file, `${header}- ${isoSeconds(now())} · ${who} · ${kind} · ${ref || '-'} · ${oneLine(text).replace(/ · /g, ' — ')}\n`);
}

export function readJournal(root, id) {
  const file = paths(root).journal(id);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map(line => ENTRY.exec(line)).filter(Boolean)
    .map(([, at, actor, kind, ref, text]) => ({at, actor, kind, ref, text}));
}
