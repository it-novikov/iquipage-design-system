import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BridgeError} from '../src/errors.mjs';
import {paths} from '../src/store.mjs';
import {pullCard, pushCard, remoteClient} from '../src/remote.mjs';

const id = '20261011-demo';
const template = readFileSync(new URL('../templates/task.md', import.meta.url), 'utf8').replace('00000000-template', id);
const card = template + '\n## Поле будущей версии\n\n```md\n## Не раздел\n```\nтекст без потерь\n';
const identity = {url: 'https://sprintique.example/mcp', transport: 'mcp', project: 'p', task: 'SPR-14'};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bridge-sync-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

test('unknown sections roundtrip and subsequent clean pull keep exact remote bytes', async t => {
  const root = fixture(t);
  let remoteCard = card, revision = 4, received;
  const client = {identity, read: async () => ({schema: 'bridge/1', revision, card: remoteCard}), write: async (baseRevision, text, key) => {
    received = {baseRevision, text, key}; remoteCard = text; return {workPlan: {revision: ++revision}};
  }};
  await pullCard(root, id, client);
  const edited = card.replace('текст без потерь', 'новый текст без потерь');
  writeFileSync(paths(root).card(id), edited);
  assert.equal(await pushCard(root, id, client), 5);
  assert.equal(received.baseRevision, 4);
  assert.equal(received.text, edited);
  assert.match(received.key, /^[a-f0-9-]{36}$/);
  remoteCard += '\nдобавлено человеком\n'; revision++;
  await pullCard(root, id, client);
  assert.equal(readFileSync(paths(root).card(id), 'utf8'), remoteCard);
  assert.ok(!readFileSync(join(paths(root).runs, 'sync', id + '.json'), 'utf8').includes('Bearer'));
});

test('CAS conflict preserves local edits and revision, never automatically retries or overwrites', async t => {
  const root = fixture(t); let calls = 0;
  const client = {identity, read: async () => ({schema: 'bridge/1', revision: 8, card}), write: async () => {
    calls++; throw new BridgeError('REVISION_CONFLICT', 'conflict');
  }};
  await pullCard(root, id, client);
  const edited = card + '\nлокальная работа\n'; writeFileSync(paths(root).card(id), edited);
  await assert.rejects(pushCard(root, id, client), {code: 'REVISION_CONFLICT'});
  assert.equal(calls, 1);
  assert.equal(readFileSync(paths(root).card(id), 'utf8'), edited);
  await assert.rejects(pullCard(root, id, client), {code: 'LOCAL_CHANGES'});
  assert.equal(JSON.parse(readFileSync(join(paths(root).runs, 'sync', id + '.json'))).revision, 8);
  await pullCard(root, id, client, {acceptRemote: true});
  assert.equal(readFileSync(paths(root).card(id), 'utf8'), card);
});

test('explicit create imports a local card only after confirming the remote plan is absent', async t => {
  const root = fixture(t);
  const {mkdirSync} = await import('node:fs'); mkdirSync(paths(root).task(id), {recursive: true});
  writeFileSync(paths(root).card(id), card);
  let input;
  const client = {identity, read: async () => ({schema: 'bridge/1', revision: 0, card: ''}), write: async (...args) => { input = args; return {workPlan: {revision: 1}}; }};
  await assert.rejects(pushCard(root, id, client), {code: 'SYNC_REQUIRED'});
  await pushCard(root, id, client, {create: true});
  assert.equal(input[0], 0); assert.equal(input[1], card);
  const otherRoot = fixture(t); mkdirSync(paths(otherRoot).task(id), {recursive: true}); writeFileSync(paths(otherRoot).card(id), card);
  await assert.rejects(pushCard(otherRoot, id, {...client, read: async () => ({schema: 'bridge/1', revision: 3, card})}, {create: true}), {code: 'SYNC_EXISTS'});
  assert.equal(readFileSync(paths(otherRoot).card(id), 'utf8'), card);
  const retryRoot = fixture(t); mkdirSync(paths(retryRoot).task(id), {recursive: true}); writeFileSync(paths(retryRoot).card(id), card);
  const retries = []; let lost = true;
  const retryClient = {...client, write: async (...args) => {
    retries.push(args); if (lost) throw new BridgeError('REMOTE_NETWORK', 'lost'); return {workPlan: {revision: 1}};
  }};
  await assert.rejects(pushCard(retryRoot, id, retryClient, {create: true}), {code: 'REMOTE_NETWORK'});
  lost = false; retryClient.read = async () => ({schema: 'bridge/1', revision: 1, card});
  await pushCard(retryRoot, id, retryClient, {create: true});
  assert.deepEqual(retries[0], retries[1]);
});

test('lost response retains exact idempotency key; editing or pulling before resolution is blocked', async t => {
  const root = fixture(t); const calls = []; let lose = true;
  const client = {identity, read: async () => ({schema: 'bridge/1', revision: 2, card}), write: async (...args) => {
    calls.push(args); if (lose) throw new BridgeError('REMOTE_NETWORK', 'timeout'); return {workPlan: {revision: 3}};
  }};
  await pullCard(root, id, client);
  await assert.rejects(pushCard(root, id, client), {code: 'REMOTE_NETWORK'});
  await assert.rejects(pullCard(root, id, client), {code: 'SYNC_PENDING'});
  writeFileSync(paths(root).card(id), card + 'edited');
  await assert.rejects(pushCard(root, id, client), {code: 'SYNC_PENDING'});
  writeFileSync(paths(root).card(id), card); lose = false;
  await pushCard(root, id, client);
  assert.deepEqual(calls[0], calls[1]);
});

test('a replay returning a newer unrelated revision cannot advance the local CAS base', async t => {
  const root = fixture(t);
  const client = {identity, read: async () => ({schema: 'bridge/1', revision: 1, card}), write: async () => ({workPlan: {revision: 3}})};
  await pullCard(root, id, client);
  await assert.rejects(pushCard(root, id, client), {code: 'REMOTE_RESPONSE'});
  const state = JSON.parse(readFileSync(join(paths(root).runs, 'sync', id + '.json')));
  assert.equal(state.revision, 1); assert.equal(state.pending.baseRevision, 1);
});

test('generic MCP and internal tool failures retain the exact mutation for retry', async t => {
  for (const code of ['MCP_ERROR', 'MCP_TOOL_UNKNOWN']) {
    const root = fixture(t); const calls = []; let unavailable = true;
    const client = {identity, read: async () => ({schema: 'bridge/1', revision: 2, card}), write: async (...args) => {
      calls.push(args); if (unavailable) throw new BridgeError(code, 'unavailable'); return {workPlan: {revision: 3}};
    }};
    await pullCard(root, id, client);
    await assert.rejects(pushCard(root, id, client), {code});
    await assert.rejects(pullCard(root, id, client), {code: 'SYNC_PENDING'});
    unavailable = false;
    await pushCard(root, id, client);
    assert.deepEqual(calls[0], calls[1]);
  }
});

test('pull catches edits made while waiting for the server, wrong target/id and secret-like cards', async t => {
  const root = fixture(t);
  const client = {identity, read: async () => ({schema: 'bridge/1', revision: 1, card})};
  await pullCard(root, id, client);
  client.read = async () => { writeFileSync(paths(root).card(id), card + 'concurrent'); return {schema: 'bridge/1', revision: 2, card}; };
  await assert.rejects(pullCard(root, id, client), {code: 'LOCAL_CHANGES'});
  await assert.rejects(pushCard(root, id, {...client, identity: {...identity, task: 'SPR-15'}}), {code: 'SYNC_TARGET'});
  await assert.rejects(pullCard(root, id, {...client, read: async () => ({schema: 'bridge/1', revision: 2, card: card.replace(id, '20261011-other')})}), {code: 'REMOTE_CARD'});
  await assert.rejects(pullCard(root, id, {...client, read: async () => ({schema: 'bridge/1', revision: 2, card: card + 'spk_' + 'a'.repeat(40)})}), {code: 'SECRET_LIKE_CONTENT'});
});

test('transport refuses OAuth on REST and unsafe destinations before network access', () => {
  const options = {url: identity.url, tokenEnv: 'SESSION', project: 'p', task: 'SPR-14', env: {SESSION: 'oauth-value'}};
  assert.throws(() => remoteClient({...options, transport: 'rest'}), {code: 'REMOTE_AUTH'});
  for (const url of ['http://remote.example', 'https://u:pw@example.com', 'https://example.com?token=secret']) assert.throws(() => remoteClient({...options, url}), {code: 'REMOTE_URL'});
});

test('MCP initializes then calls typed tools with the token confined to the same endpoint', async () => {
  const calls = [];
  const client = remoteClient({url: identity.url, tokenEnv: 'SESSION', project: 'p', task: 'SPR-14', env: {SESSION: 'oauth-value'}, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({url, options, body});
    if (body.method === 'notifications/initialized') return new Response(null, {status: 202});
    const result = body.method === 'initialize' ? {protocolVersion: '2025-11-25'} : {structuredContent: body.params.name === 'get_work_card' ? {schema: 'bridge/1', revision: 1, card} : {workPlan: {revision: 2}}};
    return Response.json({jsonrpc: '2.0', id: body.id, result});
  }});
  assert.equal((await client.read()).card, card);
  await client.write(1, card, 'retry-key');
  assert.deepEqual(calls.map(c => c.body.method), ['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
  assert.ok(calls.every(c => c.url === identity.url && c.options.redirect === 'error'));
  assert.deepEqual(calls.at(-1).body.params, {name: 'put_work_card', arguments: {projectId: 'p', task: 'SPR-14', baseRevision: 1, card, idempotencyKey: 'retry-key'}});
});

test('REST sends CAS and idempotency; HTTP errors never echo secret response bodies', async () => {
  const calls = [];
  const client = remoteClient({url: 'https://sprintique.example', transport: 'rest', tokenEnv: 'SERVICE', project: 'p', task: 'SPR-14', env: {SERVICE: 'spk_' + 'a'.repeat(40)}, fetchImpl: async (url, options) => {
    calls.push({url, options}); return new Response('secret-token-do-not-print', {status: 409});
  }});
  await assert.rejects(client.write(9, card, 'safe-key'), error => error.code === 'REVISION_CONFLICT' && !error.message.includes('secret-token'));
  assert.equal(calls[0].url, 'https://sprintique.example/api/v1/projects/p/tasks/SPR-14/work-plan/card');
  assert.deepEqual(JSON.parse(calls[0].options.body), {baseRevision: 9, card});
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'safe-key');
});

test('CLI pull and push use real HTTP with CAS and preserve an unknown section', async t => {
  const root = fixture(t); let text = card, revision = 1, mutation;
  const token = 'spk_' + 'x'.repeat(40);
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(request.url, '/api/v1/projects/p/tasks/SPR-14/work-plan/card');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') return response.end(JSON.stringify({schema: 'bridge/1', revision, card: text}));
    let body = ''; for await (const chunk of request) body += chunk;
    mutation = JSON.parse(body); assert.equal(mutation.baseRevision, revision);
    assert.ok(request.headers['idempotency-key']); text = mutation.card;
    response.end(JSON.stringify({workPlan: {revision: ++revision}}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const invoke = command => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/bridge', import.meta.url)), command, id,
      '--url', url, '--transport', 'rest', '--project', 'p', '--task', 'SPR-14', '--token-env', 'TEST_SERVICE'],
    {cwd: root, env: {...process.env, BRIDGE_ROOT: root, TEST_SERVICE: token}});
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
  });
  assert.match(await invoke('pull'), /ревизия 1/);
  writeFileSync(paths(root).card(id), card + '\nновый итог\n');
  assert.match(await invoke('push'), /ревизия 2/);
  assert.equal(mutation.card, card + '\nновый итог\n');
});
