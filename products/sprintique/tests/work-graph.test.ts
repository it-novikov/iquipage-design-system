import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
let f: Awaited<ReturnType<typeof fixture>>;
before(async () => { f = await fixture({prefix: 'WDAG'}); });
after(async () => { await f?.close(); });
const call = (method: string, url: string, payload?: object) => f.app.inject({method, url,
  headers: {...f.alice.headers, 'idempotency-key': randomUUID()}, ...(payload ? {payload} : {})});
async function ok(response: ReturnType<typeof call>) {
  const r = await response; assert.equal(r.statusCode, 200, r.body); return r.json<any>();
}
test('work dependency graph rejects cycles and unknown links without consuming the revision', async () => {
  const task = `/api/v1/projects/${f.first.id}/tasks/graph`;
  await ok(call('PUT', task, {baseRevision: 0, task: {title: 'Проверить зависимости'}}));
  const step = (id: string, dependsOn: string[] = []) => ({id, title: 'Шаг ' + id, dependsOn});
  for (const steps of [[step('A', ['B']), step('B', ['A'])],
    [step('A', ['B']), step('B', ['C']), step('C', ['A'])], [step('A', ['absent'])]]) {
    const invalid = await call('PUT', task + '/work-plan', {baseRevision: 0, goal: 'Проверить граф', steps});
    assert.equal(invalid.statusCode, 422, invalid.body);
    assert.equal((await ok(call('GET', task + '/work'))).revision, 0);
  }
  let state = await ok(call('PUT', task + '/work-plan', {baseRevision: 0, goal: 'Проверить граф',
    steps: [step('A'), step('B', ['A']), step('C', ['A', 'B'])]}));
  state = await ok(call('POST', task + '/work-plan/lease', {baseRevision: state.revision, action: 'claim'}));
  const invalid = await call('POST', task + '/work-plan/steps', {baseRevision: state.revision,
    leaseToken: state.workPlan.lease.leaseToken, step: step('D', ['absent'])});
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal((await ok(call('GET', task + '/work'))).revision, state.revision);
});
