import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => { f = await fixture({prefix: 'WSTOP'}); });
after(async () => { await f?.close(); });
async function call(headers: Record<string, string>, method: string, url: string, payload?: object) {
  return f.app.inject({method, url, headers: {...headers, 'idempotency-key': randomUUID()}, ...(payload ? {payload} : {})});
}
async function ok(response: ReturnType<typeof call>) {
  const r = await response;
  assert.equal(r.statusCode, 200, r.body);
  return r.json<any>();
}

test('human cancellation fences fresh lease claims until an explicit new assignment', async () => {
  const preset = (await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'", [f.first.workspaceId])).rows[0].id;
  const account = await ok(call(f.alice.headers, 'POST', '/api/v1/service-accounts', {name: 'Внешний агент', workspaceId: f.first.workspaceId,
    projects: [{projectId: f.first.id, presetId: preset, granted: [], revoked: []}]}));
  const minted = await ok(call(f.alice.headers, 'POST', `/api/v1/service-accounts/${account.id}/tokens`,
    {name: 'Проверка остановки', scopes: ['read', 'write'], expiresInDays: 1}));
  const agent = {authorization: `Bearer ${minted.token}`};
  const task = `/api/v1/projects/${f.first.id}/tasks/stopped`;
  await ok(call(f.alice.headers, 'PUT', task, {baseRevision: 0, task: {title: 'Остановить внешнего агента'}}));
  let state = await ok(call(f.alice.headers, 'PUT', task + '/work-plan', {baseRevision: 0, goal: 'Проверить остановку'}));
  state = await ok(call(f.alice.headers, 'POST', task + '/work-plan/sessions',
    {baseRevision: state.revision, agentId: account.id, mode: 'external', goal: 'Проверить ход работы'}));
  const session = state.sessions.find((s: {agentId: string}) => s.agentId === account.id);
  assert.ok(session);
  state = await ok(call(agent, 'POST', task + '/work-plan/lease', {baseRevision: state.revision, action: 'claim'}));
  const oldToken = state.workPlan.lease.leaseToken;
  state = await ok(call(f.alice.headers, 'PATCH', task + '/work-plan/sessions/' + session.id,
    {baseRevision: state.revision, state: 'cancelled', summary: 'Работа остановлена человеком.'}));
  const stoppedRevision = state.revision;
  const oldCheckpoint = await call(agent, 'POST', task + '/work-plan/checkpoints',
    {baseRevision: stoppedRevision, leaseToken: oldToken, summary: 'Продолжить старое поручение', nextStep: 'Следующий шаг'});
  assert.ok([403, 409].includes(oldCheckpoint.statusCode), oldCheckpoint.body);
  const freshClaim = await call(agent, 'POST', task + '/work-plan/lease', {baseRevision: stoppedRevision, action: 'claim'});
  assert.ok([403, 409].includes(freshClaim.statusCode), 'cancelled agent must not silently reclaim: ' + freshClaim.body);
  const unchanged = await ok(call(f.alice.headers, 'GET', task + '/work'));
  assert.equal(unchanged.revision, stoppedRevision);
  state = await ok(call(f.alice.headers, 'POST', task + '/work-plan/sessions',
    {baseRevision: stoppedRevision, agentId: account.id, mode: 'external', goal: 'Новое поручение после остановки'}));
  state = await ok(call(agent, 'POST', task + '/work-plan/lease', {baseRevision: state.revision, action: 'claim'}));
  assert.ok(state.workPlan.lease.leaseToken);
  assert.notEqual(state.workPlan.lease.leaseToken, oldToken);
});
