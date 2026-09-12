import {createHash,timingSafeEqual} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {FastifyInstance,FastifyRequest} from 'fastify';

interface Measurement {method:string;route:string;statusClass:number;requests:number;durationMs:number;maxDurationMs:number}
/** Bounded, aggregate-only measurements. No URL values, tenant IDs, bodies, headers or tokens. */
export function registerObservability(app:FastifyInstance,token?:string){
  if(token!==undefined&&(token.length<32||token.length>256))throw Error('Metrics token must contain 32–256 characters.');
  const start=performance.now(),started=new WeakMap<FastifyRequest,number>(),measurements=new Map<string,Measurement>();
  app.addHook('onRequest',async request=>{started.set(request,performance.now());});
  app.addHook('onResponse',async(request,reply)=>{
    const route=request.routeOptions.url||'unmatched';if(route==='/internal/metrics')return;
    const method=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(request.method)?request.method:'OTHER';
    const durationMs=Math.max(0,performance.now()-(started.get(request)||performance.now())),statusClass=Math.floor(reply.statusCode/100);
    const key=method+' '+route+' '+statusClass;
    if(!measurements.has(key)&&measurements.size>=2048)return;
    const value=measurements.get(key)||{method,route,statusClass,requests:0,durationMs:0,maxDurationMs:0};
    value.requests++;value.durationMs+=durationMs;value.maxDurationMs=Math.max(value.maxDurationMs,durationMs);measurements.set(key,value);
    if(route.startsWith('/api/')||route.startsWith('/auth/'))app.log.info({requestId:request.id,method,route,statusCode:reply.statusCode,durationMs:Math.round(durationMs)},'HTTP completed');
  });
  if(token){
    const digest=(value:string)=>createHash('sha256').update(value).digest(),expected=digest('Bearer '+token);
    app.get('/internal/metrics',async(request,reply)=>{
      if(!timingSafeEqual(digest(request.headers.authorization||''),expected))return reply.code(404).send({code:'NOT_FOUND'});
      return {schema:'sprintique.runtime-metrics/1',scope:'process',uptimeSeconds:Math.floor((performance.now()-start)/1000),rssBytes:process.memoryUsage().rss,
        completedHttpRequests:[...measurements.values()],longLivedStreams:'not included until closed',resetOnRestart:true};
    });
  }
}
