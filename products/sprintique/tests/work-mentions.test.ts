import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {anthropic, fakeProvider} from './support/fake-llm.js';
let f: Awaited<ReturnType<typeof fixture>>, llm: Awaited<ReturnType<typeof fakeProvider>>;
before(async () => {
  llm = await fakeProvider();
  f = await fixture({prefix: 'WMEN', settings: {SPRINTIQUE_SECRETS_KEY: randomBytes(32).toString('base64'),
    SPRINTIQUE_AI_ALLOWED_HOSTS: '127.0.0.1', SPRINTIQUE_AI_TIMEOUT_SECONDS: '10', SPRINTIQUE_AI_RUNNERS: '1'}});
});
after(async () => { await f?.close(); await llm?.close(); });
const call = (method: string, url: string, payload?: object) => f.app.inject({method, url,
  headers: {...f.alice.headers, 'idempotency-key': randomUUID()}, ...(payload ? {payload} : {})});
async function ok(response: ReturnType<typeof call>) {
  const r = await response; assert.equal(r.statusCode, 200, r.body); return r.json<any>();
}
test('an active run finishing does not handle a later mention from another discussion it never read', async () => {
  const connection = await ok(call('POST', `/api/v1/workspaces/${f.first.workspaceId}/ai-connections`,
    {name: 'Локальная модель', provider: 'anthropic', baseUrl: llm.url, apiKey: 'sk-ant-test-' + randomBytes(12).toString('hex')}));
  const preset = (await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'", [f.first.workspaceId])).rows[0].id;
  const account = await ok(call('POST', '/api/v1/service-accounts', {name: 'Помощник', workspaceId: f.first.workspaceId,
    projects: [{projectId: f.first.id, presetId: preset, granted: [], revoked: []}]}));
  await ok(call('PUT', `/api/v1/service-accounts/${account.id}/agent`, {baseRevision: 0, enabled: true,
    connectionId: connection.id, model: 'held-first-mention', instructions: 'Прочитать обращение.', onMention: true}));
  const base = `/api/v1/projects/${f.first.id}`, task = base + '/tasks/two-mentions';
  await ok(call('PUT', task, {baseRevision: 0, task: {title: 'Два отдельных обращения'}}));
  let release!: () => void, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  llm.script('held-first-mention', async request => {
    entered = true; await gate;
    assert.ok(!JSON.stringify(request.body).includes('Второй вопрос'));
    return anthropic.text('Ответ на первое обращение.');
  });
  try {
    await ok(call('POST', task + '/threads', {id: 'first-thread', messageId: 'first-mention',
      body: `@[Помощник](user:${account.id}) Первый вопрос.`, requiresResolution: false}));
    for (let i = 0; !entered && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(entered, 'the first provider response is held while the second mention arrives');
    await ok(call('POST', task + '/threads', {id: 'second-thread', messageId: 'second-mention',
      body: `@[Помощник](user:${account.id}) Второй вопрос из другого обсуждения.`, requiresResolution: false}));
    release();
    let view;
    for (let i = 0; i < 200; i++) {
      view = await ok(call('GET', task + '/work'));
      if (view.sessions.some((s: {state: string}) => s.state === 'completed')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(view.sessions.some((s: {state: string}) => s.state === 'completed'));
    const first = view.requests.find((r: {messageId: string}) => r.messageId === 'first-mention');
    const second = view.requests.find((r: {messageId: string}) => r.messageId === 'second-mention');
    assert.equal(first.state, 'handled');
    assert.equal(second.state, 'pending');
    assert.equal(second.sessionId, null);
    const discussion = await ok(call('GET', base + '/threads/second-thread'));
    assert.equal(discussion.messages.length, 1, 'the second request received no agent answer');
  } finally { release(); }
});

test('a provider receives the exact human assignment goal and selected source discussion', async () => {
  const connection = await ok(call('POST', `/api/v1/workspaces/${f.first.workspaceId}/ai-connections`,
    {name: 'Модель для поручения', provider: 'anthropic', baseUrl: llm.url, apiKey: 'sk-ant-test-' + randomBytes(12).toString('hex')}));
  const preset = (await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'", [f.first.workspaceId])).rows[0].id;
  const account = await ok(call('POST', '/api/v1/service-accounts', {name: 'Исполнитель', workspaceId: f.first.workspaceId,
    projects: [{projectId: f.first.id, presetId: preset, granted: [], revoked: []}]}));
  await ok(call('PUT', `/api/v1/service-accounts/${account.id}/agent`, {baseRevision: 0, enabled: true,
    connectionId: connection.id, model: 'exact-work-assignment', instructions: 'Прочитать поручение.', onMention: false}));
  const task = `/api/v1/projects/${f.first.id}/tasks/exact-assignment`;
  await ok(call('PUT', task, {baseRevision: 0, task: {title: 'Общая задача'}}));
  const goal = 'Проверить только передачу Q9, не общую задачу.';
  const source = 'Уточнение выбранного обсуждения: передать Q9 после проверки.';
  await ok(call('POST', task + '/threads', {id: 'assignment-source', messageId: 'assignment-source-message',
    body: source, requiresResolution: false}));
  const plan = await ok(call('PUT', task + '/work-plan', {baseRevision: 0, goal: 'Общий план задачи'}));
  let release!: () => void, captured: unknown;
  const gate = new Promise<void>(resolve => { release = resolve; });
  llm.script('exact-work-assignment', async request => { captured = request.body; await gate; return anthropic.text('Поручение прочитано.'); });
  try {
    await ok(call('POST', task + '/work-plan/sessions', {baseRevision: plan.revision, agentId: account.id,
      mode: 'provider_api', goal, threadId: 'assignment-source'}));
    for (let i = 0; !captured && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(captured, 'the assigned provider must receive its first request');
    const context = JSON.stringify(captured);
    assert.ok(context.includes('human-work-assignment'), 'assignment must be identified as the source of this run');
    assert.ok(context.includes(goal), 'specific human goal must reach the actual provider');
    assert.ok(context.includes(source), 'selected discussion must reach the actual provider');
    assert.ok(context.includes('assignment-source'), 'selected discussion identity must reach the actual provider');
  } finally { release(); }
});
