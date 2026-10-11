import {createHash, randomBytes, randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {TestApp} from './support/kotlin-app.js';

/** Optional disposable browser fixture, created through the same HTTP commands as real work. */
export async function seedWorkPreview(app: TestApp, admin: pg.Client, adminId: string, origin: string) {
  const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",
    [randomUUID(), adminId, createHash('sha256').update(token).digest('hex'), csrf]);
  const headers = {cookie: `__Host-sprintique=${token}`, origin, 'x-csrf-token': csrf};
  async function call(method: string, url: string, payload?: object, actor: Record<string, string> = headers): Promise<any> {
    const r = await app.inject({method, url, headers: {...actor, 'idempotency-key': randomUUID()}, ...(payload ? {payload} : {})});
    if (r.statusCode !== 200) throw Error(`Work preview ${method} ${url}: ${r.statusCode} ${r.body}`);
    return r.json();
  }
  const workspace = await call('POST', '/api/v1/workspaces', {name: 'Проверка работы агентов'});
  const project = await call('POST', '/api/v1/projects', {workspaceId: workspace.id, name: 'Работа агентов', slug: 'agent-work', key: 'WRK'});
  const preset = (await admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'", [workspace.id])).rows[0].id;
  const account = async (name: string) => call('POST', '/api/v1/service-accounts', {name, workspaceId: workspace.id,
    projects: [{projectId: project.id, presetId: preset, granted: [], revoked: []}]});
  const codex = await account('Кодекс');
  await account('Клод');
  const minted = await call('POST', `/api/v1/service-accounts/${codex.id}/tokens`, {name: 'Локальная приёмка', scopes: ['read', 'write'], expiresInDays: 1});
  const agentHeaders = {authorization: `Bearer ${minted.token}`};
  const task = `/api/v1/projects/${project.id}/tasks/work-preview`;
  await call('PUT', task, {baseRevision: 0, createInBoard: true, task: {title: 'Сохранить работу и передать её следующему участнику',
    description: 'Проверить продолжение работы по сохранённому плану, решение вопроса и передачу результата.'}});
  const criteria = [{id: 'C1', text: 'История сохраняется после обновления страницы', done: false}];
  let state = await call('PUT', task + '/work-plan', {baseRevision: 0, goal: 'Сохранить понятный ход работы и следующий шаг.', risk: 'high',
    steps: [{id: 'S1', title: 'Проверить сохранение истории', criteria}, {id: 'S2', title: 'Проверить передачу работы', dependsOn: ['S1']}]});
  state = await call('POST', task + '/work-plan/sessions', {baseRevision: state.revision, agentId: codex.id, mode: 'external', goal: 'Проверить сохранение истории.'});
  state = await call('POST', task + '/work-plan/lease', {baseRevision: state.revision, action: 'claim'}, agentHeaders);
  const leaseToken = state.workPlan.lease.leaseToken;
  state = await call('PATCH', task + '/work-plan/steps/S1', {baseRevision: state.revision, leaseToken, state: 'doing', criteria}, agentHeaders);
  state = await call('PATCH', task + '/work-plan/steps/S1', {baseRevision: state.revision, leaseToken, state: 'done',
    result: 'История остаётся доступной после обновления страницы.', evidence: [origin + '/?project=agent-work#/task/work-preview'],
    criteria: criteria.map(c => ({...c, done: true}))}, agentHeaders);
  state = await call('POST', task + '/work-plan/checkpoints', {baseRevision: state.revision, leaseToken,
    summary: 'Сохранение истории проверено. Результат готов к проверке человеком.', nextStep: 'Проверить передачу работы Клоду.'}, agentHeaders);
  state = await call('POST', task + '/work-plan/questions', {baseRevision: state.revision, leaseToken, id: 'Q1',
    title: 'Кому передать следующий шаг?', context: 'Сохранение истории проверено. Осталась проверка передачи.',
    options: [{id: 'O1', label: 'Передать Клоду', description: 'Другой участник проверит продолжение по сохранённому состоянию.', recommended: true},
      {id: 'O2', label: 'Продолжить Кодексу', description: 'Текущий участник выполнит оставшуюся проверку.'}]}, agentHeaders);
  await call('POST', task + '/work-plan/lease', {baseRevision: state.revision, action: 'release', leaseToken}, agentHeaders);
  if(process.env['PREVIEW_RELEASE1']==='1'){
    const {seedRelease1Preview}=await import('./release1-preview-seed.js');
    await seedRelease1Preview(app,project.id,headers);
  }
  return origin + '/?project=agent-work#/task/work-preview';
}
