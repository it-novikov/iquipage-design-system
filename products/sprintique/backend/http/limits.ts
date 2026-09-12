import type {FastifyInstance,FastifyRequest} from 'fastify';
import {Problem} from '../domain/errors.js';
/** Per-process safeguards, not a claim of cluster-wide quotas. The edge must not trust caller IP headers. */
export function registerLimits(app:FastifyInstance){
  const windows=new Map<string,{since:number;count:number;logins:number}>(),admitted=new WeakSet<FastifyRequest>();
  let active=0,uploads=0;
  const isUpload=(r:FastifyRequest)=>r.method==='PUT'&&/^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/content(?:\?|$)/.test(r.url);
  const release=(r:FastifyRequest)=>{if(!admitted.delete(r))return;active--;if(isUpload(r))uploads--;};
  app.addHook('onRequest',async r=>{
    if(!r.url.startsWith('/api/')&&!r.url.startsWith('/auth/'))return;
    const now=Date.now();if(windows.size>=4096)for(const [ip,w] of windows)if(now-w.since>=60000)windows.delete(ip);
    let window=windows.get(r.ip);
    if(!window){if(windows.size>=4096)throw new Problem(429,'REQUEST_LIMIT','Слишком много запросов. Повторите через минуту.');window={since:now,count:0,logins:0};windows.set(r.ip,window);}
    if(now-window.since>=60000){window.since=now;window.count=0;window.logins=0;}
    if(++window.count>1000||(r.url.startsWith('/auth/login')&&++window.logins>20))throw new Problem(429,'REQUEST_LIMIT','Слишком много запросов. Повторите через минуту.');
    // Streams have an independent cap and lifetime; do not leak this admission on hijack.
    if(/^\/api\/v1\/projects\/[^/]+\/events\?/.test(r.url)&&new URL(r.url,'http://local').searchParams.get('stream')==='true')return;
    if(active>=64||(isUpload(r)&&uploads>=8))throw new Problem(503,'BUSY','Сервис занят. Повторите через несколько секунд.');
    active++;if(isUpload(r))uploads++;admitted.add(r);
  });
  app.addHook('onResponse',async r=>release(r));
  app.addHook('onError',async r=>release(r));
  app.addHook('onTimeout',async r=>release(r));
  app.addHook('onRequestAbort',async r=>release(r));
}
