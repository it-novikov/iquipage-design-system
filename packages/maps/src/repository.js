import {commitTaskAttachments} from './board/attachment-model.js';
import {writeScopes} from './board/workspace-model.js';
import { clone, DomainError, COLLECTIONS, prepareWrite } from './model.js';

function visible(collection, value, projectId, context) {
  if (collection !== 'templates') return value.projectId === projectId;
  if (value.workspaceId !== context.workspaceId) return false;
  return value.scope === 'workspace' || (value.scope === 'personal' && value.ownerId === context.actorId) || (value.scope === 'project' && value.projectId === projectId);
}
export class MemoryRepository {
  constructor(context = {}) {
    this.context = { workspaceId: 'local-workspace', actorId: 'local-user', ...context };
    this.data = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()])); this.listeners = new Set();
    this.capabilities = { storage: 'memory', collaboration: false, events: false, llm: false };
  }
  async list(collection, projectId) { return clone([...this.data[collection].values()].filter(x => visible(collection, x, projectId, this.context))); }
  async read(collection, id, projectId) { const value = this.data[collection].get(id); return value && visible(collection, value, projectId, this.context) ? clone(value) : null; }
  async write(collection, value, baseRevision = 0, { signal } = {}) {
    signal?.throwIfAborted();
    const next = prepareWrite(collection, value, this.data[collection].get(value.id), baseRevision, [...this.data.tasks.values()], Object.fromEntries(COLLECTIONS.map(name => [name, [...this.data[name].values()]])), this.context.actorId); if (collection === 'tasks') for (const asset of commitTaskAttachments(next, this.data.tasks.get(value.id), [...this.data.attachments.values()])) this.data.attachments.set(asset.id, asset);
    this.data[collection].set(value.id, clone(next));
    this.listeners.forEach(fn => fn({ collection, id: next.id, projectId: next.projectId, revision: next.revision })); return clone(next);
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close() { this.listeners.clear(); }
}
/** Browser-only reference. Transactional compare-and-set, not a multi-user authorization system. */
export class BrowserRepository {
  constructor(namespace = 'iquipage-maps', context = {}) {
    this.context = { workspaceId: 'local-workspace', actorId: 'local-user', ...context }; this.listeners = new Set();
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(namespace) : null;
    this.channel?.addEventListener('message', e => this.listeners.forEach(fn => fn(e.data)));
    this.ready = new Promise((resolve, reject) => {
      const request = indexedDB.open(namespace, 3);
      request.onupgradeneeded = () => { for (const name of [...COLLECTIONS, '_attachmentBlobs']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' }); };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(new DomainError('STORAGE_UNAVAILABLE', 'Хранилище браузера недоступно. Экспортируйте копию.'));
      request.onblocked = () => reject(new DomainError('STORAGE_BLOCKED', 'Закройте старые вкладки этого приложения.'));
    });
    this.capabilities = { storage: 'browser', collaboration: false, events: false, llm: false };
  }
  async list(collection, projectId) {
    const db = await this.ready;
    return new Promise((resolve, reject) => {
      const request = db.transaction(collection).objectStore(collection).getAll();
      request.onsuccess = () => resolve(request.result.filter(x => visible(collection, x, projectId, this.context))); request.onerror = () => reject(request.error);
    });
  }
  async read(collection, id, projectId) {
    const db = await this.ready;
    return new Promise((resolve, reject) => {
      const request = db.transaction(collection).objectStore(collection).get(id);
      request.onsuccess = () => resolve(request.result && visible(collection, request.result, projectId, this.context) ? request.result : null); request.onerror = () => reject(request.error);
    });
  }
  async write(collection, value, baseRevision = 0, { signal } = {}) {
    signal?.throwIfAborted(); const db = await this.ready; signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const scopes = writeScopes(collection), tx = db.transaction(scopes, 'readwrite'), store = tx.objectStore(collection); let next, error;
      const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const snapshot = {}; let remaining = scopes.length;
      for (const name of scopes) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          snapshot[name] = request.result;
          if (--remaining) return;
          try {
            signal?.throwIfAborted();
            const previous = snapshot[collection].find(item => item.id === value.id);
            next = prepareWrite(collection, value, previous, baseRevision, snapshot.tasks || [], snapshot, this.context.actorId);
            if (collection === 'tasks') for (const asset of commitTaskAttachments(next, previous, snapshot.attachments || [])) tx.objectStore('attachments').put(asset);
            store.put(next);
          } catch (cause) { error = cause; tx.abort(); }
        };
      }
      tx.oncomplete = () => {
        cleanup(); const event = { collection, id: next.id, projectId: next.projectId, revision: next.revision };
        this.channel?.postMessage(event); this.listeners.forEach(fn => fn(event)); resolve(clone(next));
      };
      tx.onerror = () => { error ||= tx.error; };
      tx.onabort = () => { cleanup(); reject(error || signal?.reason || new DomainError('SAVE_FAILED', 'Не удалось сохранить. Ваша копия остаётся доступной.')); };
    });
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async close() { this.channel?.close(); this.listeners.clear(); (await this.ready).close(); }
}
/** Host-supplied baseURL. No Sprintique route, secret or API assumption. */
export class HttpRepository {
  constructor(baseURL = '/api') { this.baseURL = baseURL.replace(/\/$/, ''); this.capabilities = { storage: 'server', collaboration: false, events: false, llm: false }; }
  async request(path, { method = 'GET', body, signal } = {}) {
    const response = await fetch(this.baseURL + path, { method, signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Maps-Client': 'reference' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new DomainError(data.code || 'HTTP_ERROR', data.message || 'Не удалось выполнить запрос.', data.details); return data;
  }
  list(collection, projectId) { return this.request(`/records/${collection}?projectId=${encodeURIComponent(projectId)}`); }
  read(collection, id, projectId) { return this.request(`/records/${collection}/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`); }
  write(collection, record, baseRevision = 0, { signal } = {}) { return this.request(`/records/${collection}/${encodeURIComponent(record.id)}`, { method: 'PUT', body: { record, baseRevision }, signal }); }
  async refreshCapabilities() { this.capabilities = await this.request('/capabilities'); return this.capabilities; }
  subscribe() { return () => {}; }
  close() {}
}
