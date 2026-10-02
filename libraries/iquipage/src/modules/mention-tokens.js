'use strict';
/**
 * Mention tokens (0.6.0-vnext.29), without DOM. A mention is stored in Markdown as `@[Имя](user:<id>)`: the id names
 * the person or the service account, so the mention survives a rename, and an older renderer still shows the plain
 * name. The label is what the author saw when they picked the name; a host that knows the members passes them, and
 * then the pill shows the member's current name and a token naming anyone else is plain text. Nothing here trusts the
 * label or the id: the id has a fixed alphabet and the label is always escaped.
 */
const MENTION_ID = /^[A-Za-z0-9_-]{1,100}$/;
const LABEL_LIMIT = 80;
/** The token as stored: a label without brackets, backslashes or line breaks, and an id of [A-Za-z0-9_-]. */
const TOKEN_SOURCE = '@\\[([^\\[\\]\\\\\\n]{1,' + LABEL_LIMIT + '})\\]\\(user:([A-Za-z0-9_-]{1,100})\\)';
const TOKEN_AT = new RegExp(TOKEN_SOURCE, 'y');
/** A mention starts a word: not after a letter, digit, «_», «@» or «.» (an address is not a mention). */
const WORD_BEFORE = /[\p{L}\p{N}_@.]/u;
const QUERY_LIMIT = 40;
const LIST_LIMIT = 12;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The label a token keeps: one line, no Markdown brackets or delimiters (code, emphasis, tables), at most 80 characters. */
function mentionLabel(name) {
    const clean = String(name ?? '').replace(/[\[\]\\()`*_~|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_LIMIT).replace(/[\uD800-\uDBFF]$/, '').trim();
    return clean || 'участник';
}
/** The Markdown token for a member; throws on an id outside the token alphabet. */
function mentionToken(member) {
    const id = String(member?.id ?? '');
    if (!MENTION_ID.test(id)) throw new TypeError('A mention id is 1–100 of A-Z a-z 0-9 _ -');
    return `@[${mentionLabel(member.name)}](user:${id})`;
}
/** The token that starts exactly at `index`, or null. */
function tokenAt(text, index) {
    if (text[index] !== '@' || text[index + 1] !== '[') return null;
    if (index > 0 && WORD_BEFORE.test(text[index - 1])) return null;
    TOKEN_AT.lastIndex = index;
    const match = TOKEN_AT.exec(text);
    return match ? {id: match[2], label: match[1], start: index, end: index + match[0].length} : null;
}
/** Blanks fenced blocks and inline code (keeping every offset), so nothing inside code is read as a mention. */
function maskCode(source) {
    const blank = s => s.replace(/[^\n]/g, ' ');
    let out = '', fence = null;
    for (const line of String(source ?? '').split('\n')) {
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (fence) { out += blank(line) + '\n'; if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null; continue; }
        if (marker) { fence = marker[1]; out += blank(line) + '\n'; continue; }
        out += line.replace(/(`+)[^`\n]*?\1/g, blank) + '\n';
    }
    return out.slice(0, -1);
}
/** Every mention token of a Markdown source outside code: {id, label, start, end}. */
function parseMentions(source) {
    const text = maskCode(source), found = [];
    for (let i = text.indexOf('@['); i >= 0; i = text.indexOf('@[', i + 1)) {
        const token = tokenAt(text, i);
        if (token) { found.push(token); i = token.end - 1; }
    }
    return found;
}
/**
 * How a host names members: an array of {id, name, kind?} or a function id → {name, kind?} | string | null. Returns
 * a function that answers {name, kind} for a known member and null otherwise; undefined when nothing was given.
 */
function mentionResolver(members) {
    if (members == null) return undefined;
    if (typeof members === 'function') return id => {
        const found = members(id);
        if (typeof found === 'string') return found.trim() ? {name: found.trim(), kind: 'human'} : null;
        return found && typeof found.name === 'string' && found.name.trim() ? {name: found.name.trim(), kind: found.kind === 'service' ? 'service' : 'human'} : null;
    };
    if (!Array.isArray(members)) throw new TypeError('Mention members are an array or a function');
    const byId = new Map();
    for (const member of members) if (member && MENTION_ID.test(String(member.id ?? '')) && typeof member.name === 'string' && member.name.trim())
        byId.set(String(member.id), {name: member.name.trim(), kind: member.kind === 'service' ? 'service' : 'human'});
    return id => byId.get(id) || null;
}
/**
 * One token as HTML. A pill always means a known member and shows its current name. A token naming anyone else is its
 * label alone, plain text that never reads as a mention; without members nothing is known, so it is «@label» text.
 */
function mentionHTML(token, resolve) {
    if (!resolve) return esc('@' + token.label);
    const member = resolve(token.id);
    if (!member) return esc(token.label);
    return `<span class="md-mention" data-mention="${esc(token.id)}"${member.kind === 'service' ? ' data-kind="service"' : ''}>@${esc(member.name)}</span>`;
}
/** Plain text with a member's token as «@Имя» and anyone else's as its label: for one-line previews and quotes. */
function mentionPlainText(source, members) {
    const resolve = mentionResolver(members), text = String(source ?? ''), tokens = parseMentions(text);
    let out = '', from = 0;
    for (const token of tokens) {
        const member = resolve ? resolve(token.id) : null;
        out += text.slice(from, token.start) + (member ? '@' + member.name : resolve ? token.label : '@' + token.label);
        from = token.end;
    }
    return out + text.slice(from);
}
/** Escaped plain text with the tokens as pills (a one-paragraph preview that does not render the rest of Markdown). */
function mentionsHTML(source, members) {
    const resolve = mentionResolver(members), text = String(source ?? ''), tokens = parseMentions(text);
    let out = '', from = 0;
    for (const token of tokens) { out += esc(text.slice(from, token.start)) + mentionHTML(token, resolve); from = token.end; }
    return out + esc(text.slice(from));
}
/** Lower case with «ё» as «е», for matching names as people type them. */
const fold = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е');
/**
 * What is being typed after «@» at the caret: {start, query} (start is the index of «@»), or null. The «@» starts a
 * word, the query stays on one line with at most two spaces and 40 characters, and nothing inside code counts.
 */
function mentionQuery(value, caret) {
    const text = String(value ?? ''), end = Math.max(0, Math.min(Number(caret) || 0, text.length));
    const lineStart = text.lastIndexOf('\n', end - 1) + 1, line = text.slice(lineStart, end);
    const at = line.lastIndexOf('@');
    if (at < 0) return null;
    const query = line.slice(at + 1);
    if (query.length > QUERY_LIMIT || /[\n@\[\]()`]/.test(query) || (query.match(/ /g) || []).length > 2 || /^\s/.test(query)) return null;
    if (at > 0 && WORD_BEFORE.test(line[at - 1])) return null;
    // An open inline code span on the line: the «@» is code.
    if ((line.slice(0, at).match(/`/g) || []).length % 2) return null;
    if (maskCode(text.slice(0, end)).slice(lineStart)[at] !== '@') return null;
    return {start: lineStart + at, query};
}
/**
 * The members that match a query, people first, then service accounts: a name that starts with it, then a word of
 * the name that does, then a name that contains it. At most `limit` (12).
 */
function filterMentionCandidates(candidates, query, limit = LIST_LIMIT) {
    const q = fold(query).replace(/\s+/g, ' ').trimStart();
    const rank = member => {
        const name = fold(member.name).replace(/\s+/g, ' ').trim();
        if (!q) return 0;
        if (name.startsWith(q)) return 0;
        if (name.split(' ').some(word => word.startsWith(q.trim()) && !q.includes(' '))) return 1;
        return name.includes(q.trim()) ? 2 : -1;
    };
    const ranked = (Array.isArray(candidates) ? candidates : [])
        .filter(m => m && MENTION_ID.test(String(m.id ?? '')) && typeof m.name === 'string' && m.name.trim())
        .map((member, index) => ({member, index, rank: rank(member), service: member.kind === 'service' ? 1 : 0}))
        .filter(item => item.rank >= 0)
        .sort((a, b) => a.service - b.service || a.rank - b.rank || a.index - b.index);
    return ranked.slice(0, Math.max(1, limit)).map(item => item.member);
}

/*
 * The composer never shows a token (vnext.29). It holds plain text, «@Имя», and a side map of marks {start, end, id,
 * name}: the range of each picked mention. The map follows edits; an edit inside a name, or letters typed right
 * against it, drops the mark and the text is then an ordinary typed mention. Tokens are written only for the message.
 */
const WORD = /[\p{L}\p{N}_-]/u;
/** Plain composer text and its marks from Markdown: a member's token becomes «@Имя» with a mark, anyone else's its label. */
function mentionsFromMarkdown(source, members) {
    const resolve = mentionResolver(members), text = String(source ?? ''), marks = [];
    let out = '', from = 0;
    for (const token of parseMentions(text)) {
        out += text.slice(from, token.start);
        const member = resolve ? resolve(token.id) : {name: token.label};
        if (member) {
            marks.push({start: out.length, end: out.length + 1 + member.name.length, id: token.id, name: member.name});
            out += '@' + member.name;
        } else out += token.label;
        from = token.end;
    }
    return {text: out + text.slice(from), marks};
}
/** Whether a mark still stands for its mention in this text: «@Имя» in place, at a word start. */
function markHolds(text, mark) {
    return text.slice(mark.start, mark.end) === '@' + mark.name && !(mark.start > 0 && /[\p{L}\p{N}_@.]/u.test(text[mark.start - 1]))
        && !WORD.test(text[mark.end] || '');
}
/** The Markdown of the message: every mark that still holds becomes its token; the rest of the text is as typed. */
function mentionsToMarkdown(text, marks) {
    let out = String(text ?? '');
    const valid = (Array.isArray(marks) ? marks : []).filter(mark => mark && MENTION_ID.test(String(mark.id ?? '')) && markHolds(out, mark))
        .sort((a, b) => b.start - a.start);
    let limit = Infinity;
    for (const mark of valid) {
        if (mark.end > limit) continue;
        out = out.slice(0, mark.start) + mentionToken({id: mark.id, name: mark.name}) + out.slice(mark.end);
        limit = mark.start;
    }
    return out;
}
/**
 * The marks after the text changed from `before` to `after` (one edit: the common start and end are kept). A mark
 * before the edit stays, one after it moves; one the edit touches inside, or that letters now touch, is dropped.
 */
function shiftMentionMarks(marks, before, after) {
    const a = String(before ?? ''), b = String(after ?? '');
    if (a === b) return (marks || []).filter(mark => markHolds(b, mark));
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const oldEnd = a.length - tail, delta = b.length - a.length;
    const next = [];
    for (const mark of marks || []) {
        if (mark.end <= head) next.push(mark);
        else if (mark.start >= oldEnd) next.push({...mark, start: mark.start + delta, end: mark.end + delta});
    }
    // A change that only inserted text keeps a mark it borders; markHolds drops one that letters now touch.
    return next.filter(mark => markHolds(b, mark));
}
/** The mark that ends exactly at the caret: Backspace there removes the whole mention. */
function mentionMarkBefore(marks, caret) {
    return (marks || []).find(mark => mark.end === caret) || null;
}
Object.assign(exports, {mentionsFromMarkdown, mentionsToMarkdown, shiftMentionMarks, mentionMarkBefore, MENTION_ID_PATTERN: MENTION_ID.source, MENTION_TOKEN_PATTERN: TOKEN_SOURCE, mentionLabel, mentionToken, tokenAt, parseMentions, mentionResolver, mentionHTML, mentionPlainText, mentionsHTML, mentionQuery, filterMentionCandidates});
