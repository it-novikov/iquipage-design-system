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

/** The label a token keeps: one line, no Markdown brackets, at most 80 characters. */
function mentionLabel(name) {
    const clean = String(name ?? '').replace(/[\[\]\\()\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_LIMIT).trim();
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
/** The pill of one token: the member's current name when known, the stored label without a resolver, else text. */
function mentionHTML(token, resolve) {
    const member = resolve ? resolve(token.id) : {name: token.label, kind: 'human'};
    if (!member) return esc('@' + token.label);
    return `<span class="md-mention" data-mention="${esc(token.id)}"${member.kind === 'service' ? ' data-kind="service"' : ''}>@${esc(member.name)}</span>`;
}
/** Plain text with every token as «@Имя»: for one-line previews, titles and notifications. */
function mentionPlainText(source, members) {
    const resolve = mentionResolver(members), text = String(source ?? ''), tokens = parseMentions(text);
    let out = '', from = 0;
    for (const token of tokens) {
        const member = resolve ? resolve(token.id) : null;
        out += text.slice(from, token.start) + '@' + (member ? member.name : token.label);
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
Object.assign(exports, {MENTION_ID_PATTERN: MENTION_ID.source, MENTION_TOKEN_PATTERN: TOKEN_SOURCE, mentionLabel, mentionToken, tokenAt, parseMentions, mentionResolver, mentionHTML, mentionPlainText, mentionsHTML, mentionQuery, filterMentionCandidates});
