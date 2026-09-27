import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
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
import {loadCard, paths} from '../src/store.mjs';
import {readJournal} from '../src/journal.mjs';
import {findSecrets} from '../src/secrets.mjs';

const BIN = fileURLToPath(new URL('../bin/bridge', import.meta.url));

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'bridge-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: root});
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], {cwd: root});
  operations.init(root);
  return root;
}

function plannedTask(root, risk = 'standard') {
  const id = operations.createTask(root, {slug: 'demo', title: 'Демо задача', risk, owner: 'owner', actor: 'tester'});
  operations.addStep(root, id, {agent: 'tester', title: 'Первый шаг', what: 'Сделать A', how: 'Через B', why: 'Ради C', accept: ['A работает', 'Есть тест']});
  operations.addStep(root, id, {agent: 'tester', title: 'Второй шаг', what: 'Сделать D', how: 'Через E', why: 'Ради F', accept: ['D работает']});
  return id;
}

before(() => { process.env.BRIDGE_NOW = '2026-09-27T20:00:00Z'; delete process.env.BRIDGE_AGENT; delete process.env.BRIDGE_TASK; });

test('frontmatter round-trips scalars, quoted strings and lists', () => {
  const raw = 'bridge: 1\ntitle: "Перенос: бэкенд"\nholder:\nlinks:\n  - https://example.com/pull/1\ntags: [a, b]\n';
  const {data, order} = parseFrontmatter(raw);
  assert.deepEqual(data, {bridge: 1, title: 'Перенос: бэкенд', holder: '', links: ['https://example.com/pull/1'], tags: ['a', 'b']});
  const again = parseFrontmatter(renderFrontmatter(data, order).slice(4, -4));
  assert.deepEqual(again.data, data);
});

test('an unchanged card renders byte for byte', () => {
  const template = readFileSync(new URL('../templates/task.md', import.meta.url), 'utf8');
  assert.equal(renderCard(parseCard(template)), template);
  const root = repository();
  const id = plannedTask(root);
  const text = readFileSync(paths(root).card(id), 'utf8');
  assert.equal(renderCard(parseCard(text)), text);
});

test('a plan step keeps its fields and criteria', () => {
  const root = repository();
  const id = plannedTask(root);
  const [first, second] = parseSteps(loadCard(root, id));
  assert.equal(first.id, 'S1');
  assert.equal(second.id, 'S2');
  assert.deepEqual(first.criteria.map(item => item.text), ['A работает', 'Есть тест']);
  assert.equal(first.fields['Как'].value, 'Через B');
  assert.deepEqual(validateTask(root, id).errors, []);
});

test('a live lease blocks a second agent until handoff', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude'});
  assert.throws(() => operations.claim(root, id, {agent: 'codex'}), {code: 'TASK_HELD'});
  operations.handoff(root, id, {agent: 'claude', reason: 'limit'});
  const card = loadCard(root, id);
  assert.equal(card.meta.holder, '');
  assert.equal(card.meta.status, 'ready');
  assert.match(renderCard(card), /\*\*Причина:\*\* limit — claude/);
  assert.ok(existsSync(join(paths(root).run(id), 'handoff.json')));
  operations.claim(root, id, {agent: 'codex'});
  assert.equal(loadCard(root, id).meta.holder, 'codex');
});

test('checkpoint updates the handoff and appends traps without losing earlier ones', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'claude'});
  operations.checkpoint(root, id, {agent: 'claude', state: 'Каркас готов', current: 'S1 — половина', next: 'Тест', traps: ['Первая ловушка']});
  operations.checkpoint(root, id, {agent: 'claude', next: 'Второй тест', traps: ['Вторая ловушка']});
  const text = readFileSync(paths(root).card(id), 'utf8');
  assert.match(text, /- \*\*Состояние:\*\* Каркас готов\n- \*\*Сейчас:\*\* S1 — половина\n- \*\*Дальше:\*\* Второй тест/);
  assert.match(text, / {2}- Первая ловушка\n {2}- Вторая ловушка/);
});

test('a step is done only with ticked criteria and a result', () => {
  const root = repository();
  const id = plannedTask(root);
  assert.throws(() => operations.setStep(root, id, 'S1', 'done', {agent: 'a', result: 'abc123'}), {code: 'CRITERIA_OPEN'});
  assert.throws(() => operations.setStep(root, id, 'S1', 'done', {agent: 'a', check: 'all'}), {code: 'RESULT_REQUIRED'});
  operations.setStep(root, id, 'S1', 'done', {agent: 'a', check: 'all', result: 'коммит abc123; 4 теста'});
  const [first] = parseSteps(loadCard(root, id));
  assert.equal(first.status, 'done');
  assert.ok(first.criteria.every(item => item.done));
  operations.setStep(root, id, 'S2', 'active', {agent: 'a'});
  assert.throws(() => operations.setStep(root, id, 'S1', 'active', {agent: 'a'}), {code: 'STEP_ACTIVE'});
});

test('decisions and questions are numbered and answered in place', () => {
  const root = repository();
  const id = plannedTask(root);
  assert.equal(operations.decide(root, id, 'Берём X — проще', {agent: 'a'}), 'D1');
  assert.equal(operations.decide(root, id, 'Берём Y', {agent: 'a'}), 'D2');
  assert.equal(operations.ask(root, id, 'Нужен ли Z?', {agent: 'a'}), 'Q1');
  operations.answer(root, id, 'Q1', 'Не нужен', {agent: 'owner'});
  const text = readFileSync(paths(root).card(id), 'utf8');
  assert.doesNotMatch(text, /Пока нет/);
  assert.match(text, /- \*\*Q1\*\* \[answered\] Нужен ли Z\? → владелец\n {2}Ответ: Не нужен/);
  assert.deepEqual(readJournal(root, id).map(entry => entry.kind), ['create', 'note', 'note', 'decision', 'decision', 'question', 'answer']);
});

test('check rejects secrets, unfinished done tasks and open blocking review findings', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.checkpoint(root, id, {agent: 'a', state: 'DATABASE_URL=postgres://app:hunter22@db/app', next: 'x'});
  assert.ok(validateTask(root, id).errors.some(error => /пароль в URL/.test(error)));
  operations.checkpoint(root, id, {agent: 'a', state: 'Чисто', next: 'x'});
  const journal = paths(root).journal(id);
  writeFileSync(journal, readFileSync(journal, 'utf8').replace(/hunter22/g, 'redacted'));
  operations.setStatus(root, id, 'done', {agent: 'owner'});
  assert.ok(validateTask(root, id).errors.some(error => /шаги не завершены: S1, S2/.test(error)));
  operations.setStatus(root, id, 'review', {agent: 'owner'});
  const {file} = operations.startReview(root, id, {reviewer: 'codex', base: 'main'});
  writeFileSync(file, readFileSync(file, 'utf8').replace('## Замечания\n', '## Замечания\n- **F1** [P1] `a.kt:1` — Гонка.\n  Сценарий: два запроса.\n  Решение: [open]\n'));
  assert.ok(validateTask(root, id).warnings.some(warning => /P0\/P1: 1/.test(warning)));
  writeFileSync(file, readFileSync(file, 'utf8').replace('[open]', '[fixed abc123]'));
  assert.ok(!validateTask(root, id).warnings.some(warning => /P0\/P1/.test(warning)));
});

test('secret patterns do not flag ordinary engineering text', () => {
  assert.deepEqual(findSecrets('Команда: LC_ALL=C npm test; ключ Idempotency-Key; password policy — минимум 12 символов'), []);
  assert.equal(findSecrets('token ghp_0123456789abcdefghijklmnopqrstuvwxyzAB').length, 1);
});

test('the brief shows the active step in full, finished steps in one line and fits a budget', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.setStep(root, id, 'S1', 'done', {agent: 'a', check: 'all', result: 'коммит abc123'});
  operations.setStep(root, id, 'S2', 'active', {agent: 'a'});
  const card = loadCard(root, id);
  const brief = renderBrief(card, {journal: readJournal(root, id)});
  assert.match(brief, /✓ S1\. Первый шаг — коммит abc123/);
  assert.match(brief, /▶ S2\. Второй шаг \[active\]\n {2}- \*\*Что:\*\* Сделать D/);
  const small = renderBrief(card, {journal: readJournal(root, id), budget: 400});
  assert.ok(small.length < brief.length);
  assert.match(small, /S2\. Второй шаг/);
});

test('outcomes are classified only when the agent failed', () => {
  const signals = {limit: ['usage limit', 'hit your limit'], overloaded: ['overloaded'], auth: ['invalid api key'], context: ['prompt is too long']};
  assert.equal(classifyOutcome({code: 0, tail: 'implemented usage limit checks'}, signals).kind, 'exited');
  assert.equal(classifyOutcome({code: 1, tail: 'Error: Overloaded'}, signals).kind, 'overloaded');
  assert.equal(classifyOutcome({code: 1, tail: 'Invalid API key'}, signals).kind, 'auth');
  assert.equal(classifyOutcome({code: 1, tail: 'Prompt is too long'}, signals).kind, 'context');
  assert.equal(classifyOutcome({code: 1, tail: 'segfault'}, signals).kind, 'crash');
  assert.equal(classifyOutcome({code: null, timedOut: true, tail: ''}, signals).kind, 'timeout');
  const limit = classifyOutcome({code: 1, tail: 'Claude AI usage limit reached|1790000000'}, signals);
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
  writeFileSync(file, body);
  return [process.execPath, file];
}

test('the relay hands the task to the next agent when the first hits its limit', async () => {
  const root = repository();
  const id = plannedTask(root);
  const limited = fakeAgent(root, 'limited', `process.stderr.write('Claude AI usage limit reached|1790000000\\n'); process.exit(1);`);
  const finisher = fakeAgent(root, 'finisher', `
    import {execFileSync} from 'node:child_process';
    const run = (...args) => execFileSync(process.execPath, [${JSON.stringify(BIN)}, ...args], {stdio: 'inherit'});
    run('checkpoint', '--state', 'Всё готово', '--next', 'Ревью');
    run('status', 'review');
  `);
  writeFileSync(paths(root).config, JSON.stringify({bridge: 1, chain: ['a', 'b'], agents: {
    a: {name: 'agent-a', command: limited, input: 'stdin', signals: {limit: ['usage limit']}},
    b: {name: 'agent-b', command: finisher, input: 'stdin', signals: {}},
  }}));
  const reports = [];
  const result = await runRelay(root, id, {quiet: true, report: text => reports.push(text)});
  assert.equal(result.outcome, 'review', reports.join('\n'));
  const journal = readJournal(root, id);
  assert.ok(journal.some(entry => entry.kind === 'trigger' && /agent-a: limit/.test(entry.text)));
  assert.ok(journal.some(entry => entry.kind === 'handoff' && /limit → agent-b/.test(entry.text)));
  assert.ok(journal.some(entry => entry.actor === 'agent-b' && entry.kind === 'checkpoint'));
  assert.equal(loadCard(root, id).meta.status, 'review');
});

test('the relay stops when sessions make no progress', async () => {
  const root = repository();
  const id = plannedTask(root);
  const idle = fakeAgent(root, 'idle', 'process.exit(0);');
  writeFileSync(paths(root).config, JSON.stringify({bridge: 1, chain: ['a'], session: {stallRounds: 2}, agents: {a: {name: 'idle', command: idle, input: 'stdin'}}}));
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'stalled');
  assert.equal(loadCard(root, id).meta.holder, '');
});

test('the relay reports exhaustion when every agent is limited', async () => {
  const root = repository();
  const id = plannedTask(root);
  const limited = fakeAgent(root, 'limited', `process.stderr.write('rate limit, try again in 30 minutes'); process.exit(1);`);
  writeFileSync(paths(root).config, JSON.stringify({bridge: 1, chain: ['a'], agents: {a: {name: 'a', command: limited, input: 'argument', signals: {limit: ['rate limit']}}}}));
  const result = await runRelay(root, id, {quiet: true, report: () => {}});
  assert.equal(result.outcome, 'exhausted');
  assert.equal(result.retryAt.toISOString(), '2026-09-27T20:30:00.000Z');
});

test('Claude Code hooks hand off on a limit only for the task this agent holds', () => {
  const root = repository();
  const id = plannedTask(root);
  operations.claim(root, id, {agent: 'someone-else'});
  handleClaudeHook(root, {hook_event_name: 'StopFailure', error_type: 'rate_limit'}, {agent: 'claude-code'});
  assert.equal(loadCard(root, id).meta.holder, 'someone-else');
  operations.handoff(root, id, {agent: 'someone-else', reason: 'planned'});
  operations.claim(root, id, {agent: 'claude-code'});
  const brief = handleClaudeHook(root, {hook_event_name: 'SessionStart', source: 'compact'}, {agent: 'claude-code'});
  assert.match(brief, /Контекст восстановлен из моста/);
  assert.match(brief, /S1\. Первый шаг/);
  handleClaudeHook(root, {hook_event_name: 'StopFailure', error_type: 'overloaded'}, {agent: 'claude-code'});
  assert.equal(loadCard(root, id).meta.holder, 'claude-code');
  handleClaudeHook(root, {hook_event_name: 'StopFailure', error_type: 'rate_limit'}, {agent: 'claude-code'});
  const card = loadCard(root, id);
  assert.equal(card.meta.holder, '');
  assert.match(renderCard(card), /Причина:\*\* limit — claude-code/);
});

test('the CLI resolves the only open task and prints errors without a stack trace', () => {
  const root = repository();
  const id = plannedTask(root);
  const env = {...process.env, BRIDGE_AGENT: 'cli-agent'};
  execFileSync(process.execPath, [BIN, 'claim'], {cwd: root, env});
  assert.equal(loadCard(root, id).meta.holder, 'cli-agent');
  let failure;
  try { execFileSync(process.execPath, [BIN, 'step', 'S9', 'done'], {cwd: root, env, stdio: 'pipe'}); } catch (error) { failure = error; }
  assert.equal(failure.status, 1);
  assert.match(failure.stderr.toString(), /^bridge: Шаг S9 не найден\.\n$/);
  mkdirSync(join(root, 'nested'));
  assert.match(execFileSync(process.execPath, [BIN, 'list'], {cwd: join(root, 'nested'), env}).toString(), /20260927-demo {2}active/);
});

test('the data model follows the interchange schema', async () => {
  const {toModel} = await import('../src/model.mjs');
  const schema = JSON.parse(readFileSync(new URL('../schema/task.v1.schema.json', import.meta.url), 'utf8'));
  const root = repository();
  const id = plannedTask(root);
  operations.checkpoint(root, id, {agent: 'a', state: 'Готов каркас', next: 'Тесты', traps: ['Ловушка']});
  operations.decide(root, id, 'Берём X — проще', {agent: 'a'});
  operations.ask(root, id, 'Нужен ли Z?', {agent: 'a'});
  operations.answer(root, id, 'Q1', 'Нет', {agent: 'owner'});
  const model = toModel(loadCard(root, id));
  // Every top-level and nested key is declared by the schema, and every required key is present.
  const check = (value, node, path) => {
    if (node.required) for (const key of node.required) assert.ok(Object.hasOwn(value, key), `${path}.${key} missing`);
    if (node.properties) for (const key of Object.keys(value)) assert.ok(node.properties[key], `${path}.${key} not in schema`);
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) check(value[key], child, `${path}.${key}`);
      if (Array.isArray(value[key]) && child.items?.properties) value[key].forEach((item, index) => check(item, child.items, `${path}.${key}[${index}]`));
    }
  };
  check(model, schema, 'card');
  assert.equal(model.format, 'bridge/1');
  assert.deepEqual(model.handoff.traps, ['Ловушка']);
  assert.deepEqual(model.decisions[0], {id: 'D1', date: '2026-09-27', text: 'Берём X — проще'});
  assert.deepEqual(model.questions[0], {id: 'Q1', status: 'answered', text: 'Нужен ли Z?', to: 'владелец', answer: 'Нет'});
  assert.equal(model.steps[0].criteria.length, 2);
});
