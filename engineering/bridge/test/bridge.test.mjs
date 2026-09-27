import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFrontmatter, renderFrontmatter} from '../src/frontmatter.mjs';
import {parseCard, parseSteps, renderCard} from '../src/card.mjs';
import * as operations from '../src/operations.mjs';
import {renderBrief} from '../src/brief.mjs';
import {classifyOutcome, parseRetryAt, runRelay} from '../src/runner.mjs';
import {handleClaudeHook} from '../src/hooks.mjs';
import {validateTask} from '../src/validate.mjs';
import {loadCard, paths, resolveTaskId} from '../src/store.mjs';
import {readJournal} from '../src/journal.mjs';
import {findSecrets} from '../src/secrets.mjs';
import {leaseDirectory, liveLease} from '../src/lease.mjs';
import {toModel} from '../src/model.mjs';
import {collectStats} from '../src/stats.mjs';
import {reviewerPrompt} from '../src/prompt.mjs';

const BIN = fileURLToPath(new URL('../bin/bridge', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {cwd: root, encoding: 'utf8'});

function repository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bridge-test-')));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
  operations.init(root);
  return root;
}

function plannedTask(root, {risk = 'standard', acceptance = true} = {}) {
  const id = operations.createTask(root, {slug: 'demo', title: 'Демо задача', risk, owner: 'owner', actor: 'tester'});
  const card = readFileSync(paths(root).card(id), 'utf8');
  writeFileSync(paths(root).card(id), card.replace('## Приёмка\n\nПока нет.\n', acceptance ? '## Приёмка\n\n- [ ] A1. Демо работает\n' : '## Приёмка\n\n'));
  operations.addStep(root, id, {agent: 'tester', title: 'Первый шаг', what: 'Сделать A', how: 'Через B', why: 'Ради C', accept: ['A работает', 'Есть тест'], covers: acceptance ? 'A1' : ''});
  operations.addStep(root, id, {agent: 'tester', title: 'Второй шаг', what: 'Сделать D', how: 'Через E', why: 'Ради F', accept: ['D работает']});
  return id;
}

beforeEach(() => {
  process.env.BRIDGE_NOW = '2026-09-27T20:00:00Z';
  for (const name of ['BRIDGE_AGENT', 'BRIDGE_TASK', 'BRIDGE_SESSION', 'BRIDGE_RELAY', 'CLAUDE_ENV_FILE', 'BRIDGE_LEASE_DIR']) delete process.env[name];
});

// ---------------------------------------------------------------------------------------------------------------
// Format

test('frontmatter keeps titles as text and reads lists only for list keys', () => {
  const raw = 'bridge: 1\ntitle: [WIP] 2026\nowner: \'Демо\'\nlinks:\n  - https://example.com/pull/1\ntags: [a, b]\n';
  const {data, order} = parseFrontmatter(raw);
  assert.deepEqual(data, {bridge: 1, title: '[WIP] 2026', owner: 'Демо', links: ['https://example.com/pull/1'], tags: ['a', 'b']});
  assert.deepEqual(parseFrontmatter(renderFrontmatter(data, order).slice(4, -4)).data, data);
});

test('an unchanged card renders byte for byte', () => {
  const template = readFileSync(new URL('../templates/task.md', import.meta.url), 'utf8');
  assert.equal(renderCard(parseCard(template)), template);
  const root = repository();
  const text = readFileSync(paths(root).card(plannedTask(root)), 'utf8');
  assert.equal(renderCard(parseCard(text)), text);
});

test('a heading inside a code block does not start a section or a step', () => {
  const root = repository();
  const id = plannedTask(root);
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('## Рамки', 'Пример ответа:\n\n```markdown\n## Ответ\n### S9. Не шаг [done]\n```\n\n## Рамки'));
  const card = loadCard(root, id);
  assert.ok(!card.sections.some(item => item.name === 'Ответ'));
  assert.match(toModel(card).goal, /## Ответ/);
  assert.deepEqual(parseSteps(card).map(step => step.id), ['S1', 'S2']);
});

test('check requires task criteria to be covered by steps and titles to agree', () => {
  const root = repository();
  const id = plannedTask(root);
  assert.deepEqual(validateTask(root, id).errors, []);
  operations.addAcceptance(root, id, 'Документация обновлена', {agent: 'tester'});
  operations.setStatus(root, id, 'ready', {agent: 'tester'});
  assert.ok(validateTask(root, id).errors.some(error => /Критерии приёмки без шага: A2/.test(error)));
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('# Демо задача', '# Другое название'));
  assert.ok(validateTask(root, id).errors.some(error => /различается/.test(error)));
});

test('check raises the risk level required by the changed files', () => {
  const root = repository();
  const id = operations.createTask(root, {slug: 'risk', title: 'Риск', risk: 'standard', owner: 'o', base: 'main', actor: 'a'});
  operations.addStep(root, id, {agent: 'a', title: 'Шаг', what: 'w', how: 'h', why: 'y', accept: ['c'], covers: 'A1'});
  operations.setStatus(root, id, 'active', {agent: 'a'});
  git(root, 'switch', '-q', '-c', 'feature/risk');
  mkdirSync(join(root, 'db', 'migration'), {recursive: true});
  writeFileSync(join(root, 'db', 'migration', 'V1__x.sql'), 'SELECT 1;');
  git(root, 'add', 'db');
  git(root, 'commit', '-q', '-m', 'migration');
  assert.ok(validateTask(root, id).errors.some(error => /требуют уровня риска high/.test(error)));
});

// ---------------------------------------------------------------------------------------------------------------
// Leases and writers

test('the lease lives in the git common directory and is shared by worktrees', () => {
  const root = repository();
  const id = plannedTask(root);
  git(root, 'add', '.bridge');
  git(root, 'commit', '-q', '-m', 'card');
  const other = join(realpathSync(mkdtempSync(join(tmpdir(), 'bridge-wt-'))), 'wt');
  git(root, 'worktree', 'add', '-q', other);
  operations.claim(root, id, {agent: 'claude'});
  assert.ok(leaseDirectory(root).startsWith(join(root, '.git')));
  assert.equal(leaseDirectory(other), leaseDirectory(root));
  assert.throws(() => operations.claim(other, id, {agent: 'codex'}), {code: 'TASK_HELD'});
  assert.doesNotMatch(readFileSync(paths(root).card(id), 'utf8'), /holder|lease/);
});

test('writers need the lease; a forced write is journaled with its reason', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude'});
  assert.throws(() => operations.checkpoint(root, id, {agent: 'codex', state: 'чужая правка', next: 'x'}), {code: 'TASK_HELD'});
  assert.throws(() => operations.setStep(root, id, 'S1', 'active', {agent: 'codex'}), {code: 'TASK_HELD'});
  operations.setStatus(root, id, 'blocked', {agent: 'owner', force: true, reason: 'владелец остановил'});
  assert.match(readJournal(root, id).at(-1).text, /принудительно: владелец остановил/);
});

test('a checkpoint by the holder renews the lease and keeps the agent notes', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude', ttlHours: 1});
  process.env.BRIDGE_NOW = '2026-09-27T20:50:00Z';
  operations.checkpoint(root, id, {agent: 'claude', state: 'Каркас готов', current: 'S1 — половина', next: 'Тест', uncommitted: 'компилируется', traps: ['Первая']});
  operations.checkpoint(root, id, {agent: 'claude', next: 'Второй тест', traps: ['Вторая']});
  assert.equal(liveLease(root, id).expires, '2026-09-27T21:50:00Z');
  const text = readFileSync(paths(root).card(id), 'utf8');
  assert.match(text, /\*\*Незакоммичено:\*\* компилируется\n- \*\*Рабочая копия:\*\* нет · HEAD /);
  assert.match(text, / {2}- Первая\n {2}- Вторая/);
});

test('a handoff frees the lease without touching the card status', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude'});
  operations.handoff(root, id, {agent: 'claude', reason: 'limit'});
  assert.equal(liveLease(root, id), null);
  assert.equal(loadCard(root, id).meta.status, 'active');
  assert.match(readFileSync(paths(root).card(id), 'utf8'), /\*\*Причина:\*\* limit — claude/);
  operations.claim(root, id, {agent: 'codex'});
  assert.equal(liveLease(root, id).holder, 'codex');
});

test('secret-like text is refused when written and found when edited by hand', () => {
  const root = repository();
  const id = plannedTask(root);
  for (const value of ['sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123', 'export OPENAI_API_KEY=abcdefghijklmnop', 'Authorization: Bearer abcdefghijklmnopqrstuvwx',
    'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGH', 'postgres://app:hunter22@db/app']) {
    assert.throws(() => operations.checkpoint(root, id, {agent: 'a', state: value, next: 'x'}), {code: 'SECRET_LIKE_CONTENT'}, value);
  }
  assert.deepEqual(findSecrets('LC_ALL=C npm test; ключ Idempotency-Key; password policy — 12 символов; TEST_S3_CONFIG=$PWD/x'), []);
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('Ради C', 'Ради ghp_0123456789abcdefghijklmnopqrstuvwxyzAB'));
  assert.ok(validateTask(root, id).errors.some(error => /токен GitHub/.test(error)));
});

test('a task becomes done only without unfinished steps, unmet criteria or open blocking findings', () => {
  const root = repository();
  const id = plannedTask(root);
  assert.throws(() => operations.setStatus(root, id, 'done', {agent: 'owner'}), /не завершены шаги S1, S2; не выполнены критерии A1/);
  for (const step of ['S1', 'S2']) operations.setStep(root, id, step, 'done', {agent: 'a', check: 'all', result: 'коммит abc'});
  operations.acceptCriterion(root, id, 'A1', {agent: 'a'});
  const {file} = operations.startReview(root, id, {reviewer: 'r', base: 'main'});
  writeFileSync(file, readFileSync(file, 'utf8').replace('## Замечания\n', '## Замечания\n- **F1** [P1] `a.kt:1` — Гонка.\n  Сценарий: два запроса.\n  Решение: [open]\n'));
  assert.throws(() => operations.setStatus(root, id, 'done', {agent: 'owner'}), /открыты P0\/P1: R1\/F1/);
  writeFileSync(file, readFileSync(file, 'utf8').replace('[open]', '[fixed abc123]'));
  operations.setStatus(root, id, 'done', {agent: 'owner'});
  assert.deepEqual(validateTask(root, id).errors, []);
});

test('parallel reviewers get their own files in one round; a follow-up lists earlier findings', () => {
  const root = repository();
  const id = plannedTask(root);
  const first = operations.startReview(root, id, {reviewer: 'a', base: 'main'});
  const second = operations.startReview(root, id, {reviewer: 'b', base: 'main'});
  assert.notEqual(first.file, second.file);
  assert.equal(first.round, 1);
  assert.equal(second.round, 1);
  writeFileSync(first.file, readFileSync(first.file, 'utf8').replace('verdict: pending', 'verdict: changes-requested')
    .replace('## Замечания\n', '## Замечания\n- **F1** [P2] `x:1` — Имя.\n  Решение: [fixed abc]\n'));
  writeFileSync(second.file, readFileSync(second.file, 'utf8').replace('verdict: pending', 'verdict: approve'));
  const third = operations.startReview(root, id, {reviewer: 'c', base: 'main', since: 'R1,R2'});
  assert.equal(third.round, 2);
  assert.deepEqual(third.previous.map(item => item.id), ['R1', 'R2']);
  assert.match(reviewerPrompt(root, id, {agent: 'c', reviewFile: third.file, baseRef: 'main', previous: third.previous}), /- F1 \[P2\] fixed — `x:1` — Имя\./);
});

test('one broken card does not break listing or resolution of the others', () => {
  const root = repository();
  const id = plannedTask(root);
  mkdirSync(join(paths(root).tasks, '20260927-broken'));
  writeFileSync(paths(root).card('20260927-broken'), '---\ntitle: "не закрыта\n---\n');
  const listed = spawnSync(process.execPath, [BIN, 'list'], {cwd: root, encoding: 'utf8'});
  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /20260927-demo/);
  assert.match(listed.stdout, /20260927-broken {2}✗/);
  assert.equal(resolveTaskId(root, undefined), id);
});

// ---------------------------------------------------------------------------------------------------------------
// Brief, model, stats

test('the brief shows acceptance, the active step in full and finished steps in one line', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.setStep(root, id, 'S1', 'done', {agent: 'a', check: 'all', result: 'коммит abc123'});
  operations.setStep(root, id, 'S2', 'active', {agent: 'a'});
  const card = loadCard(root, id);
  const brief = renderBrief(card, {journal: readJournal(root, id), lease: {holder: 'claude', expires: '2026-09-27T22:00:00Z'}});
  assert.match(brief, /## Приёмка\n- \[ \] A1\. Демо работает/);
  assert.match(brief, /✓ S1\. Первый шаг — коммит abc123/);
  assert.match(brief, /▶ S2\. Второй шаг \[active\]\n {2}- \*\*Что:\*\* Сделать D/);
  assert.match(brief, /держит claude/);
  assert.ok(renderBrief(card, {budget: 400}).length < brief.length);
});

test('the JSON projection follows the schema and keeps text outside known fields', () => {
  const schema = JSON.parse(readFileSync(new URL('../schema/task.v1.schema.json', import.meta.url), 'utf8'));
  const root = repository();
  const id = plannedTask(root);
  operations.checkpoint(root, id, {agent: 'a', state: 'Готов каркас', next: 'Тесты', traps: ['Ловушка']});
  operations.decide(root, id, 'Берём X — проще', {agent: 'a'});
  operations.ask(root, id, 'Нужен ли Z?', {agent: 'a'});
  operations.answer(root, id, 'Q1', 'Нет', {agent: 'owner'});
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('- **Зачем:** Ради C\n', '- **Зачем:** Ради C\nЗаметка под шагом.\n').replace('## Решения', '## Риски\n\nСрок.\n\n## Решения'));
  const model = toModel(loadCard(root, id));
  const check = (value, node, path) => {
    for (const key of node.required ?? []) assert.ok(Object.hasOwn(value, key), `${path}.${key} missing`);
    if (node.properties) for (const key of Object.keys(value)) assert.ok(node.properties[key], `${path}.${key} not in schema`);
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) check(value[key], child, `${path}.${key}`);
      if (Array.isArray(value[key]) && child.items?.properties) value[key].forEach((item, index) => check(item, child.items, `${path}.${key}[${index}]`));
    }
  };
  check(model, schema, 'card');
  assert.deepEqual(model.acceptance, [{id: 'A1', text: 'Демо работает', done: false}]);
  assert.deepEqual(model.steps[0].covers, ['A1']);
  assert.equal(model.steps[0].notes, 'Заметка под шагом.');
  assert.deepEqual(model.extraSections, [{name: 'Риски', text: 'Срок.'}]);
  assert.deepEqual(model.questions[0], {id: 'Q1', status: 'answered', text: 'Нужен ли Z?', to: 'владелец', answer: 'Нет'});
});

test('stats report cycle time, review rounds and handoffs', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude'});
  operations.handoff(root, id, {agent: 'claude', reason: 'limit'});
  process.env.BRIDGE_NOW = '2026-09-28T02:00:00Z';
  for (const step of ['S1', 'S2']) operations.setStep(root, id, step, 'done', {agent: 'a', check: 'all', result: 'ok'});
  operations.acceptCriterion(root, id, 'A1', {agent: 'a'});
  operations.setStatus(root, id, 'done', {agent: 'owner'});
  const stats = collectStats(root);
  assert.equal(stats.byRisk.standard.medianCycleHours, 6);
  assert.deepEqual(stats.handoffs, {limit: 1});
});

// ---------------------------------------------------------------------------------------------------------------
// Relay

test('outcomes are classified only when the agent failed, from its last lines', () => {
  const signals = {limit: ['usage limit reached'], overloaded: ['overloaded_error'], auth: ['invalid x-api-key'], context: ['prompt is too long']};
  assert.equal(classifyOutcome({code: 0, stderr: 'usage limit reached'}, signals).kind, 'exited');
  assert.equal(classifyOutcome({code: 1, stderr: 'overloaded_error'}, signals).kind, 'overloaded');
  assert.equal(classifyOutcome({code: 1, stderr: 'invalid x-api-key'}, signals).kind, 'auth');
  assert.equal(classifyOutcome({code: 1, stdout: 'Prompt is too long'}, signals).kind, 'context');
  assert.equal(classifyOutcome({code: null, timedOut: true}, signals).kind, 'timeout');
  const old = `invalid x-api-key\n${Array.from({length: 40}, (_, index) => `test ${index} ok`).join('\n')}\nsegfault`;
  assert.equal(classifyOutcome({code: 1, stderr: old}, signals).kind, 'crash');
  const limit = classifyOutcome({code: 1, stderr: 'Claude AI usage limit reached|1790000000'}, signals);
  assert.equal(limit.kind, 'limit');
  assert.equal(limit.retryAt.getTime(), 1790000000 * 1000);
});

test('retry time is read from common provider messages', () => {
  const reference = new Date('2026-09-27T20:00:00Z');
  assert.equal(parseRetryAt('Please try again in 20 minutes', reference).toISOString(), '2026-09-27T20:20:00.000Z');
  assert.equal(parseRetryAt('retry-after: 30', reference).toISOString(), '2026-09-27T20:00:30.000Z');
  assert.ok(parseRetryAt("You've hit your limit · resets 3am", reference) > reference);
  assert.equal(parseRetryAt('nothing here', reference), null);
});

function fakeAgent(root, name, body) {
  const file = join(root, `${name}.mjs`);
  writeFileSync(file, `import {execFileSync} from 'node:child_process';\nconst run = (...args) => execFileSync(process.execPath, [${JSON.stringify(BIN)}, ...args], {stdio: 'inherit'});\n${body}`);
  return [process.execPath, file];
}

function configure(root, config) {
  writeFileSync(paths(root).config, JSON.stringify({bridge: 1, ...config}));
}

test('the relay hands the task to the next agent when the first hits its limit', async () => {
  const root = repository();
  const id = plannedTask(root);
  configure(root, {chain: ['a', 'b'], agents: {
    a: {name: 'agent-a', command: fakeAgent(root, 'limited', `process.stderr.write('Claude AI usage limit reached|1790000000\\n'); process.exit(1);`), input: 'stdin', signals: {limit: ['usage limit reached']}},
    b: {name: 'agent-b', command: fakeAgent(root, 'finisher', `run('checkpoint', '--state', 'Всё готово', '--next', 'Ревью'); run('status', 'review');`), input: 'stdin', signals: {}},
  }});
  const reports = [];
  const result = await runRelay(root, id, {quiet: true, report: text => reports.push(text)});
  assert.equal(result.outcome, 'review', reports.join('\n'));
  const journal = readJournal(root, id);
  assert.ok(journal.some(entry => entry.kind === 'trigger' && /agent-a: limit/.test(entry.text)));
  assert.ok(journal.some(entry => entry.kind === 'handoff' && /limit → agent-b/.test(entry.text)));
  assert.ok(journal.some(entry => entry.actor === 'agent-b' && entry.kind === 'checkpoint'));
});

test('the relay stops an agent that only triggers session hooks', async () => {
  const root = repository();
  const id = plannedTask(root);
  // What `claude -p` does with the repository hooks: SessionStart and SessionEnd, no work.
  const idle = fakeAgent(root, 'idle', `
    import {spawnSync} from 'node:child_process';
    for (const event of ['SessionStart', 'SessionEnd']) spawnSync(process.execPath, [${JSON.stringify(BIN)}, 'hook', 'claude'], {input: JSON.stringify({hook_event_name: event, session_id: 'relay-session'})});
  `);
  configure(root, {chain: ['a'], session: {stallRounds: 2}, agents: {a: {name: 'idle', command: idle, input: 'stdin'}}});
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'stalled');
  assert.equal(loadCard(root, id).meta.status, 'blocked');
});

test('the relay gives a fast step to an agent configured for fast work', async () => {
  const root = repository();
  const id = plannedTask(root);
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('- **Приёмка:**\n  - [ ] A работает', '- **Модель:** fast\n- **Приёмка:**\n  - [ ] A работает'));
  configure(root, {chain: ['strong', 'cheap'], agents: {
    strong: {name: 'strong', model: 'strong', command: fakeAgent(root, 'strong', `run('status', 'review');`), input: 'stdin'},
    cheap: {name: 'cheap', model: 'fast', command: fakeAgent(root, 'cheap', `run('status', 'review');`), input: 'stdin'},
  }});
  await runRelay(root, id, {quiet: true, report: () => {}});
  assert.ok(readJournal(root, id).some(entry => entry.actor === 'cheap' && entry.kind === 'status'));
});

test('the relay reports exhaustion when every agent is limited', async () => {
  const root = repository();
  const id = plannedTask(root);
  configure(root, {chain: ['a'], agents: {a: {name: 'a', command: fakeAgent(root, 'limited', `process.stderr.write('rate limit reached, try again in 30 minutes'); process.exit(1);`), input: 'argument', signals: {limit: ['rate limit reached']}}}});
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'exhausted');
  assert.equal(result.retryAt.toISOString(), '2026-09-27T20:30:00.000Z');
});

// ---------------------------------------------------------------------------------------------------------------
// Claude Code hooks

test('hooks act only on the lease of their own session', () => {
  const root = repository();
  const id = plannedTask(root);
  const envFile = join(root, 'claude-env.sh');
  writeFileSync(envFile, '');
  process.env.CLAUDE_ENV_FILE = envFile;
  handleClaudeHook(root, {hook_event_name: 'SessionStart', source: 'startup', session_id: 'session-a'});
  assert.match(readFileSync(envFile, 'utf8'), /export BRIDGE_SESSION=session-a\nexport BRIDGE_AGENT=claude-code/);
  process.env.BRIDGE_SESSION = 'session-a';
  operations.claim(root, id, {agent: 'claude-code'});
  // Another Claude Code session in the same repository ends: the task stays held.
  handleClaudeHook(root, {hook_event_name: 'SessionEnd', session_id: 'session-b', reason: 'other'});
  assert.equal(liveLease(root, id).holder, 'claude-code');
  // The same session after compaction receives the brief.
  assert.match(handleClaudeHook(root, {hook_event_name: 'SessionStart', source: 'compact', session_id: 'session-a'}), /Контекст восстановлен/);
  assert.doesNotMatch(handleClaudeHook(root, {hook_event_name: 'SessionStart', source: 'resume', session_id: 'session-a'}), /Контекст восстановлен/);
  handleClaudeHook(root, {hook_event_name: 'StopFailure', error_type: 'overloaded', session_id: 'session-a'});
  assert.equal(liveLease(root, id).holder, 'claude-code');
  const spawned = [];
  configure(root, {relay: {fromHooks: true}, chain: [], agents: {}});
  handleClaudeHook(root, {hook_event_name: 'StopFailure', error_type: 'rate_limit', session_id: 'session-a'}, {spawnRelay: (...args) => spawned.push(args)});
  assert.equal(liveLease(root, id), null);
  assert.match(readFileSync(paths(root).card(id), 'utf8'), /Причина:\*\* limit — claude-code/);
  assert.deepEqual(spawned, [[root, id, 'claude-code']]);
});

test('the CLI names a person as human and prints errors without a stack trace', () => {
  const root = repository();
  const id = plannedTask(root);
  const env = {...process.env, BRIDGE_AGENT: '', USER: 'tester'};
  delete env.BRIDGE_AGENT;
  execFileSync(process.execPath, [BIN, 'claim'], {cwd: root, env});
  assert.equal(liveLease(root, id).holder, 'human:tester');
  const failure = spawnSync(process.execPath, [BIN, 'step', 'S9', 'done'], {cwd: root, env, encoding: 'utf8'});
  assert.equal(failure.status, 1);
  assert.equal(failure.stderr, 'bridge: Шаг S9 не найден.\n');
  const held = spawnSync(process.execPath, [BIN, 'checkpoint', '--state', 's', '--next', 'n', '--agent', 'codex'], {cwd: root, env, encoding: 'utf8'});
  assert.equal(held.status, 3);
  assert.ok(existsSync(join(root, '.bridge', 'tasks', id, 'journal.md')));
});

// ---------------------------------------------------------------------------------------------------------------
// Review round 2

test('a relay started inside a Claude Code session keeps its leases free of that session', async () => {
  const root = repository();
  const id = plannedTask(root);
  process.env.BRIDGE_SESSION = 'interactive-session';
  configure(root, {chain: ['a'], agents: {a: {name: 'worker', command: fakeAgent(root, 'worker', `
    import {spawnSync} from 'node:child_process';
    const envFile = process.env.BRIDGE_ROOT + '/relay-env.sh';
    spawnSync(process.execPath, [${JSON.stringify(BIN)}, 'hook', 'claude'], {input: JSON.stringify({hook_event_name: 'SessionStart', source: 'startup', session_id: 'relay-inner'}), env: {...process.env, CLAUDE_ENV_FILE: envFile}});
    run('claim'); run('checkpoint', '--state', 'Работа идёт', '--next', 'Дальше'); run('status', 'review');
  `), input: 'stdin'}}});
  writeFileSync(join(root, 'relay-env.sh'), '');
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'review');
  assert.equal(readFileSync(join(root, 'relay-env.sh'), 'utf8'), '');
  assert.ok(readJournal(root, id).some(entry => entry.actor === 'worker' && entry.kind === 'checkpoint'));
});

test('an agent that repeats the same checkpoint every session is stalled', async () => {
  const root = repository();
  const id = plannedTask(root);
  configure(root, {chain: ['a'], session: {stallRounds: 2}, agents: {a: {name: 'repeater', command: fakeAgent(root, 'repeater', `
    run('checkpoint', '--state', 'То же самое', '--next', 'То же'); run('handoff', '--reason', 'planned');
  `), input: 'stdin'}}});
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'stalled');
});

test('after a fast step the next ordinary step goes back to the strong agent', async () => {
  const root = repository();
  const id = plannedTask(root);
  const file = paths(root).card(id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('- **Приёмка:**\n  - [ ] A работает', '- **Модель:** fast\n- **Приёмка:**\n  - [ ] A работает'));
  const body = step => `run('step', '${step}', 'done', '--check', 'all', '--result', 'ok');`;
  configure(root, {chain: ['strong', 'cheap'], agents: {
    strong: {name: 'strong', model: 'strong', command: fakeAgent(root, 'strong', `${body('S2')} run('status', 'review');`), input: 'stdin'},
    cheap: {name: 'cheap', model: 'fast', command: fakeAgent(root, 'cheap', body('S1')), input: 'stdin'},
  }});
  await runRelay(root, id, {quiet: true, report: () => {}});
  const steps = readJournal(root, id).filter(entry => entry.kind === 'step' && entry.text.startsWith('done'));
  assert.deepEqual(steps.map(entry => [entry.ref, entry.actor]), [['S1', 'cheap'], ['S2', 'strong']]);
});

test('every free text written by a command is checked for secrets', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'a'});
  assert.throws(() => operations.release(root, id, {agent: 'a', note: 'token ghp_0123456789abcdefghijklmnopqrstuvwxyzAB'}), {code: 'SECRET_LIKE_CONTENT'});
  assert.throws(() => operations.handoff(root, id, {agent: 'a', to: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123'}), {code: 'SECRET_LIKE_CONTENT'});
  assert.throws(() => operations.claim(root, id, {agent: 'b', force: true, reason: 'Bearer abcdefghijklmnopqrstuvwxyz0123'}), {code: 'SECRET_LIKE_CONTENT'});
});

test('a rejected P1 waits for the owner, a waived one does not, a P0 is never deferred', () => {
  const root = repository();
  const id = plannedTask(root);
  for (const step of ['S1', 'S2']) operations.setStep(root, id, step, 'done', {agent: 'a', check: 'all', result: 'ok'});
  operations.acceptCriterion(root, id, 'A1', {agent: 'a'});
  const {file} = operations.startReview(root, id, {reviewer: 'r', base: 'main'});
  const write = resolution => writeFileSync(file, readFileSync(file, 'utf8').replace(/## Замечания\n[\s\S]*?\n## Итог/, `## Замечания\n- **F1** [P1] \`a:1\` — Гонка.\n  Решение: ${resolution}\n\n## Итог`));
  write('[rejected: не согласен]');
  assert.throws(() => operations.setStatus(root, id, 'done', {agent: 'owner'}), /R1\/F1/);
  write('[waived owner: риск принят до выпуска 2.1]');
  operations.setStatus(root, id, 'done', {agent: 'owner'});
  writeFileSync(file, readFileSync(file, 'utf8').replace('[P1]', '[P0]').replace(/Решение: .*/, 'Решение: [deferred 20260101-later: потом]'));
  assert.ok(validateTask(root, id).errors.some(error => /P0 нельзя переносить/.test(error)));
});

test('the session after /clear keeps the lease and receives the brief', () => {
  const root = repository();
  const id = plannedTask(root);
  process.env.BRIDGE_SESSION = 'before-clear';
  operations.claim(root, id, {agent: 'claude-code'});
  handleClaudeHook(root, {hook_event_name: 'SessionEnd', session_id: 'before-clear', reason: 'clear'});
  assert.equal(liveLease(root, id).session, 'before-clear');
  const brief = handleClaudeHook(root, {hook_event_name: 'SessionStart', source: 'clear', session_id: 'after-clear'});
  assert.match(brief, /Контекст восстановлен из моста/);
  assert.equal(liveLease(root, id).session, 'after-clear');
});

// ---------------------------------------------------------------------------------------------------------------
// Confirmation review R4

test('the relay respects a lease it did not grant: an agent in a terminal or another relay', async () => {
  const root = repository();
  const id = plannedTask(root);
  configure(root, {chain: ['a'], agents: {a: {name: 'claude-code', command: fakeAgent(root, 'noop', `run('status', 'review');`), input: 'stdin'}}});
  operations.claim(root, id, {agent: 'codex'});
  await assert.rejects(runRelay(root, id, {quiet: true, report: () => {}}), {code: 'TASK_HELD'});
  operations.release(root, id, {agent: 'codex'});
  operations.claim(root, id, {agent: 'claude-code', session: '', relay: 'other-relay'});
  await assert.rejects(runRelay(root, id, {quiet: true, report: () => {}}), {code: 'TASK_HELD'});
});

test('the relay takes over the lease of the session that started it, and that session ending leaves it alone', async () => {
  const root = repository();
  const id = plannedTask(root);
  process.env.BRIDGE_SESSION = 'starter';
  operations.claim(root, id, {agent: 'claude-code'});
  configure(root, {chain: ['a'], agents: {a: {name: 'claude-code', command: fakeAgent(root, 'worker', `
    import {spawnSync} from 'node:child_process';
    run('checkpoint', '--state', 'Работаю', '--next', 'Дальше');
    spawnSync(process.execPath, [${JSON.stringify(BIN)}, 'hook', 'claude'], {input: JSON.stringify({hook_event_name: 'SessionEnd', session_id: 'starter', reason: 'other'}), env: {...process.env, BRIDGE_RELAY: '', BRIDGE_SESSION: 'starter'}});
    run('checkpoint', '--state', 'Всё ещё работаю', '--next', 'Ревью'); run('status', 'review');
  `), input: 'stdin'}}});
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'review');
  assert.ok(readJournal(root, id).some(entry => entry.kind === 'checkpoint' && /Ревью/.test(entry.text)));
});

test('an agent that only commits the same card every session is stalled', async () => {
  const root = repository();
  const id = plannedTask(root);
  git(root, 'add', '.bridge');
  git(root, 'commit', '-q', '-m', 'card');
  configure(root, {chain: ['a'], session: {stallRounds: 2}, agents: {a: {name: 'committer', command: fakeAgent(root, 'committer', `
    run('checkpoint', '--state', 'То же', '--next', 'То же');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-am', 'card', '--allow-empty']);
  `), input: 'stdin'}}});
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'stalled');
});

test('only the task owner can waive a blocking finding', () => {
  const root = repository();
  const id = plannedTask(root);
  const {file} = operations.startReview(root, id, {reviewer: 'r', base: 'main'});
  writeFileSync(file, readFileSync(file, 'utf8').replace('## Замечания\n', '## Замечания\n- **F1** [P1] `a:1` — Гонка.\n  Решение: [waived agent-x: сам решил]\n'));
  assert.ok(validateTask(root, id).errors.some(error => /\[waived\] ставит владелец задачи \(owner\)/.test(error)));
});
