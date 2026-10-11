import {createHash, randomUUID} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCard} from './card.mjs';
import {BridgeError} from './errors.mjs';
import {requireNoSecrets} from './secrets.mjs';
import {paths, TASK_ID, withLock, writeAtomic} from './store.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const fail = (code, message) => { throw new BridgeError(code, message); };
const revisionOf = value => value?.workPlan?.revision ?? value?.revision;
const validRevision = value => Number.isSafeInteger(value) && value >= 0;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Credentials are deliberately supplied by env name, never saved in sync state or command arguments. */
export function remoteClient({url, transport = 'mcp', tokenEnv, project, task, env = process.env, fetchImpl = fetch}) {
  let endpoint;
  try { endpoint = new URL(url); } catch { fail('REMOTE_URL', 'Укажите полный адрес сервера.'); }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      !(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) {
    fail('REMOTE_URL', 'Нужен HTTPS адрес без credentials, query и fragment (HTTP разрешён только loopback).');
  }
  if (!['mcp', 'rest'].includes(transport)) fail('TRANSPORT', 'transport: mcp или rest.');
  if (!tokenEnv || !ENV_NAME.test(tokenEnv) || !env[tokenEnv]) fail('REMOTE_AUTH', 'Укажите --token-env с именем непустой переменной.');
  const token = env[tokenEnv];
  if (/[\r\n]/.test(token)) fail('REMOTE_AUTH', 'Некорректное значение credentials.');
  if (transport === 'rest' && !token.startsWith('spk_')) fail('REMOTE_AUTH', 'REST требует spk_ service token; MCP OAuth используйте только с --transport mcp.');
  if (!project || !task) fail('REMOTE_TARGET', 'Нужны --project и --task.');
  const target = {projectId: project, task};
  let sequence = 0, protocol = null, session = null;
  const headers = () => ({Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
    ...(protocol ? {'MCP-Protocol-Version': protocol} : {}), ...(session ? {'Mcp-Session-Id': session} : {})});
  async function request(address, method, body, extra = {}) {
    let response;
    try {
      response = await fetchImpl(address, {method, headers: {...headers(), ...extra}, redirect: 'error',
        signal: AbortSignal.timeout(30000), ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    } catch { fail('REMOTE_NETWORK', 'Сервер не ответил. Изменяющий запрос мог выполниться; повторите push без редактирования карточки.'); }
    // Do not echo server bodies, URLs, credentials or transport exceptions into logs.
    if (!response.ok) fail(response.status === 409 ? 'REVISION_CONFLICT' : `REMOTE_${response.status}`,
      response.status === 409 ? 'План изменился на сервере. Сохраните локальные изменения и сравните с новой карточкой.' : `Сервер отклонил запрос (HTTP ${response.status}).`);
    if (response.status === 202 || response.status === 204) return null;
    let data;
    try { data = await response.json(); } catch { fail('REMOTE_RESPONSE', 'Сервер вернул ответ вне JSON-контракта Sprintique.'); }
    session = response.headers.get('Mcp-Session-Id') ?? session;
    return data;
  }
  async function rpc(method, params, notification = false) {
    const id = ++sequence;
    const data = await request(endpoint.href, 'POST', {jsonrpc: '2.0', ...(notification ? {} : {id}), method, params});
    if (notification) return;
    if (data?.jsonrpc !== '2.0' || data?.id !== id) fail('REMOTE_RESPONSE', 'MCP ответ не соответствует запросу.');
    if (data.error) fail('MCP_ERROR', 'MCP отклонил запрос. Проверьте доступ и поддержку инструмента.');
    return data.result;
  }
  async function call(name, args) {
    if (!protocol) {
      const initialized = await rpc('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'iquipage-bridge', version: '1.0.0'}});
      if (!initialized?.protocolVersion) fail('REMOTE_RESPONSE', 'Нет версии протокола MCP.');
      protocol = initialized.protocolVersion;
      await rpc('notifications/initialized', {}, true);
    }
    const result = await rpc('tools/call', {name, arguments: args});
    if (result?.isError) {
      const code = result.structuredContent?.error?.code;
      const conflict = typeof code === 'string' && /CONFLICT|REVISION/.test(code);
      const definite = typeof code === 'string' && !/TEMPORARILY_UNAVAILABLE|INTERNAL|UNKNOWN/.test(code);
      fail(conflict ? 'REVISION_CONFLICT' : definite ? 'MCP_TOOL_ERROR' : 'MCP_TOOL_UNKNOWN', conflict ? 'План изменился на сервере. Сравните карточки перед повторной записью.' : 'Инструмент MCP не подтвердил действие. Проверьте права и состояние плана.');
    }
    return result?.structuredContent?.data ?? result?.structuredContent;
  }
  const base = endpoint.href.replace(/\/$/, '');
  const address = `${base}/api/v1/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(task)}/work-plan/card`;
  return {
    identity: {url: endpoint.href, transport, project, task},
    read: () => transport === 'mcp' ? call('get_work_card', target) : request(address, 'GET'),
    write: (baseRevision, card, idempotencyKey) => transport === 'mcp'
      ? call('put_work_card', {...target, baseRevision, card, idempotencyKey})
      : request(address, 'PUT', {baseRevision, card}, {'Idempotency-Key': idempotencyKey}),
  };
}

const stateFile = (root, id) => join(paths(root).runs, 'sync', `${id}.json`);
function readState(root, id) {
  if (!existsSync(stateFile(root, id))) return null;
  try { return JSON.parse(readFileSync(stateFile(root, id), 'utf8')); }
  catch { fail('SYNC_STATE', 'Состояние синхронизации повреждено. Сохраните карточку перед восстановлением.'); }
}
const saveState = (root, id, state) => writeAtomic(stateFile(root, id), `${JSON.stringify(state, null, 2)}\n`);
function cardCheck(card, id) {
  if (typeof card !== 'string' || Buffer.byteLength(card) > 1000000) fail('REMOTE_CARD', 'Карточка отсутствует или слишком велика.');
  requireNoSecrets(card);
  const parsed = parseCard(card);
  if (parsed.meta.bridge !== 1 || parsed.meta.id !== id) fail('REMOTE_CARD', 'Версия или id карточки не совпадает с локальной задачей.');
}
function checkIdentity(state, client) {
  if (state && JSON.stringify(state.remote) !== JSON.stringify(client.identity)) fail('SYNC_TARGET', 'Карточка связана с другим удалённым планом.');
}

/** Fetch first, compare again under the local lock: a concurrent local edit is never overwritten. */
export async function pullCard(root, id, client, {acceptRemote = false} = {}) {
  if (!TASK_ID.test(id)) fail('TASK_ID', 'Нужен локальный id YYYYMMDD-slug.');
  const data = await client.read();
  if (data?.schema !== 'bridge/1' || !validRevision(data.revision)) fail('REMOTE_RESPONSE', 'Нет bridge/1 или серверной ревизии.');
  cardCheck(data.card, id);
  return withLock(root, id, () => {
    const state = readState(root, id);
    checkIdentity(state, client);
    if (state?.pending) fail('SYNC_PENDING', 'Исход предыдущего push неизвестен. Сначала повторите push без редактирования карточки.');
    if (existsSync(paths(root).card(id))) {
      const current = readFileSync(paths(root).card(id), 'utf8');
      if (!acceptRemote && current !== data.card && (!state || hash(current) !== state.syncedHash)) fail('LOCAL_CHANGES', 'Есть локальные изменения. Сохраните их отдельно; --accept-remote заменяет карточку серверной версией.');
    }
    writeAtomic(paths(root).card(id), data.card);
    saveState(root, id, {remote: client.identity, revision: data.revision, syncedHash: hash(data.card)});
    return data.revision;
  });
}

/** Pending key survives timeouts, enabling the exact same mutation to be retried safely. */
export async function pushCard(root, id, client, {create = false} = {}) {
  if (!TASK_ID.test(id)) fail('TASK_ID', 'Нужен локальный id YYYYMMDD-slug.');
  const initialState = create ? readState(root, id) : null;
  if (initialState) checkIdentity(initialState, client);
  // A repeated --create after a lost reply must reach the saved pending key, not a fresh preflight.
  if (create && !initialState) {
    const remote = await client.read();
    if (remote?.schema !== 'bridge/1' || remote.revision !== 0 || remote.card !== '') fail('SYNC_EXISTS', 'На сервере уже есть план. Сначала прочитайте его и сравните карточки.');
    withLock(root, id, () => {
      const state = readState(root, id);
      if (state) fail('SYNC_EXISTS', 'Карточка уже связана с сервером. Используйте обычный push.');
      cardCheck(readFileSync(paths(root).card(id), 'utf8'), id);
      saveState(root, id, {remote: client.identity, revision: 0, syncedHash: null});
    });
  }
  const prepared = withLock(root, id, () => {
    const state = readState(root, id);
    if (!state) fail('SYNC_REQUIRED', 'Сначала выполните pull для получения серверной ревизии.');
    checkIdentity(state, client);
    const card = readFileSync(paths(root).card(id), 'utf8');
    cardCheck(card, id);
    const digest = hash(card);
    if (state.pending && state.pending.hash !== digest) fail('SYNC_PENDING', 'Предыдущий push имеет неизвестный исход. Восстановите его карточку перед повтором.');
    const pending = state.pending ?? {hash: digest, key: randomUUID(), baseRevision: state.revision};
    saveState(root, id, {...state, pending});
    return {state, pending, card};
  });
  let result;
  try { result = await client.write(prepared.pending.baseRevision, prepared.card, prepared.pending.key); }
  catch (error) {
    // A definite CAS refusal has no effect; unknown network outcomes keep the key for retry.
    if (['REVISION_CONFLICT', 'MCP_TOOL_ERROR', 'REMOTE_400', 'REMOTE_401', 'REMOTE_403', 'REMOTE_404', 'REMOTE_422', 'REMOTE_429'].includes(error.code)) withLock(root, id, () => {
      const state = readState(root, id);
      if (state?.pending?.key === prepared.pending.key) { delete state.pending; saveState(root, id, state); }
    });
    throw error;
  }
  const revision = revisionOf(result);
  if (!validRevision(revision) || revision !== prepared.pending.baseRevision + 1) fail('REMOTE_RESPONSE', 'Ответ записи не содержит ревизию именно этой команды; повторите тот же push после проверки сервера.');
  return withLock(root, id, () => {
    const state = readState(root, id);
    if (state?.pending?.key !== prepared.pending.key) fail('SYNC_RACE', 'Состояние синхронизации изменилось.');
    saveState(root, id, {remote: client.identity, revision, syncedHash: prepared.pending.hash});
    return revision;
  });
}
