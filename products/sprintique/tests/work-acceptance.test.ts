import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture, startApp} from './fixture.js';

// Independent acceptance through HTTP: competing edits must preserve a single plan,
// and a long working history must remain readable without exposing another project.
let f: Awaited<ReturnType<typeof fixture>>;
type User = Awaited<ReturnType<typeof fixture>>['alice'];
before(async () => { f = await fixture({prefix: 'WAC'}); });
after(async () => { await f?.close(); });
const call = (user: User, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object, key: string = randomUUID()) =>
  f.app.inject({method, url, headers: {...user.headers, 'idempotency-key': key}, ...(payload ? {payload} : {})});
const path = (task: string) => `/api/v1/projects/${f.first.id}/tasks/${task}`;
async function ok(response: ReturnType<typeof call>) {
  const r = await response;
  assert.equal(r.statusCode, 200, r.body);
  return r.json<any>();
}

test('work acceptance: simultaneous initial edits preserve one complete proposal and allow a deliberate retry', async () => {
  await ok(call(f.alice, 'PUT', path('race'), {baseRevision: 0, task: {title: 'Согласовать работу'}}));
  const proposals = ['Первое предложение', 'Второе предложение'].map(goal => ({baseRevision: 0, goal,
    steps: [{id: 'S1', title: goal, criteria: [{id: 'C1', text: 'Результат проверен'}]}]}));
  const results = await Promise.all(proposals.map(p => call(f.alice, 'PUT', path('race') + '/work-plan', p)));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const winner = results.findIndex(r => r.statusCode === 200);
  const winningProposal = proposals[winner], otherProposal = proposals[1 - winner];
  assert.ok(winningProposal);
  assert.ok(otherProposal);
  const saved = await ok(call(f.alice, 'GET', path('race') + '/work'));
  assert.equal(saved.revision, 1);
  assert.equal(saved.workPlan.goal, winningProposal.goal);
  assert.equal(saved.workPlan.steps[0].title, winningProposal.goal);
  const retried = await ok(call(f.alice, 'PUT', path('race') + '/work-plan', {...otherProposal, baseRevision: saved.revision}));
  assert.equal(retried.revision, 2);
  assert.equal(retried.workPlan.goal, otherProposal.goal);
});

test('work acceptance: repeated checkpoint is one event and the whole history survives pagination', async () => {
  await ok(call(f.alice, 'PUT', path('history'), {baseRevision: 0, task: {title: 'История работы'}}));
  let state = await ok(call(f.alice, 'PUT', path('history') + '/work-plan', {baseRevision: 0, goal: 'Сохранить ход работы'}));
  state = await ok(call(f.alice, 'POST', path('history') + '/work-plan/lease', {baseRevision: state.revision, action: 'claim'}));
  const leaseToken = state.workPlan.lease.leaseToken;
  assert.ok(leaseToken);
  let firstWrite: {payload: object; key: string; revision: number} | undefined;
  for (let i = 0; i < 24; i++) {
    const checkpoint = {baseRevision: state.revision, leaseToken, summary: `Проверена часть ${i + 1}.`, nextStep: 'Продолжить проверку.'};
    const key = randomUUID();
    state = await ok(call(f.alice, 'POST', path('history') + '/work-plan/checkpoints', checkpoint, key));
    if (i === 0) firstWrite = {payload: checkpoint, key, revision: state.revision};
    const repeated = await ok(call(f.alice, 'POST', path('history') + '/work-plan/checkpoints', checkpoint, key));
    assert.equal(repeated.revision, state.revision);
  }
  assert.ok(firstWrite);
  const oldReceipt = await ok(call(f.alice, 'POST', path('history') + '/work-plan/checkpoints', firstWrite.payload, firstWrite.key));
  assert.equal(oldReceipt.revision, firstWrite.revision, 'a lost old reply cannot advance the caller past unseen edits');
  const unsafeContinuation = await call(f.alice, 'POST', path('history') + '/work-plan/checkpoints',
    {baseRevision: oldReceipt.revision, leaseToken, summary: 'Продолжение со старой карточкой.', nextStep: 'Проверить изменения.'});
  assert.equal(unsafeContinuation.statusCode, 409, unsafeContinuation.body);
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await ok(call(f.alice, 'GET', path('history') + '/work-events?limit=7' + (cursor ? '&cursor=' + cursor : '')));
    ids.push(...page.items.map((event: {id: string}) => event.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 26);
  for (const url of [path('history') + '/work', path('history') + '/work-events?limit=7&cursor=' + ids[0]]) {
    const hidden = await call(f.bob, 'GET', url);
    assert.equal(hidden.statusCode, 404, hidden.body);
    assert.ok(!hidden.body.includes('Проверена часть'));
  }
});

test('work acceptance: switching off agent_work on the migrated schema keeps the task usable', async () => {
  const off = await startApp({settings: {SPRINTIQUE_FEATURES: 'none', SPRINTIQUE_AI_RUNNERS: '0'}});
  try {
    const read = await off.inject({url: path('history'), headers: f.alice.headers});
    assert.equal(read.statusCode, 200, read.body);
    const session = await off.inject({url: '/api/v1/session', headers: f.alice.headers});
    assert.equal(session.statusCode, 200, session.body);
    assert.deepEqual(session.json<any>().features, []);
    for (const suffix of ['/work', '/work-events', '/work-plan/card', '/work-plan/brief']) {
      const blocked = await off.inject({url: path('history') + suffix, headers: f.alice.headers});
      assert.equal(blocked.statusCode, 404, blocked.body);
    }
    const mutation = await off.inject({method: 'POST', url: path('history') + '/work-plan/lease',
      headers: {...f.alice.headers, 'idempotency-key': randomUUID()}, payload: {baseRevision: 26, action: 'claim'}});
    assert.equal(mutation.statusCode, 404, mutation.body);
  } finally {
    await off.close();
  }
});
