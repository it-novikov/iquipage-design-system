import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Database} from '../infrastructure/database.js';
import {hash} from '../infrastructure/database.js';
import {getCredential,params} from './app.js';
import {projectEvents} from '../application/events.js';
import {Problem,requireCondition} from '../domain/errors.js';

/** SSE publishes the committed outbox as a durable feed. It does not mark external delivery as complete. */
export function registerEventRoutes(app:FastifyInstance,db:Database){
  const streams=new Map<()=>void,string>();
  app.addHook('preClose',async()=>{for(const close of streams.keys())close();});
  app.get('/api/v1/projects/:projectId/events',async(request,reply)=>{
    const {projectId}=params(request),credential=getCredential(request);
    const q=z.strictObject({cursor:z.string().max(3000).optional(),stream:z.enum(['true']).optional()}).parse(request.query);
    let cursor=q.cursor||z.string().max(3000).optional().parse(request.headers['last-event-id']);
    const read=()=>db.authenticated(credential,(tx,actor)=>projectEvents(tx,actor,projectId,cursor));
    const first=await read();if(q.stream!=='true')return first;
    const identity=hash(credential.token);
    requireCondition([...streams.values()].filter(value=>value===identity).length<3,429,'STREAM_LIMIT','Слишком много подключений. Закройте лишние вкладки.');
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no','Connection':'keep-alive'});
    let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const close=()=>{if(closed)return;closed=true;if(timer)clearTimeout(timer);streams.delete(close);reply.raw.end();};
    streams.set(close,identity);reply.raw.once('close',close);
    const send=(batch:Awaited<ReturnType<typeof read>>)=>{
      for(const event of batch.items){
        // Backpressure never creates an unbounded protected in-memory queue. Reconnect from last received ID.
        if(reply.raw.writableLength>256*1024){close();return;}
        reply.raw.write(`id: ${event.cursor}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`);cursor=event.cursor;
      }
      if(!batch.items.length)reply.raw.write(': keepalive\n\n');
    };
    const tick=async()=>{
      if(closed)return;
      try{const batch=await read();if(closed)return;send(batch);if(!closed)timer=setTimeout(tick,batch.hasMore?0:1000);}
      catch(error){if(!closed){const denied=error instanceof Problem&&[401,403,404].includes(error.status);
        reply.raw.write(`event: ${denied?'access-revoked':'resync'}\ndata: ${JSON.stringify({clearCache:true,code:denied?'ACCESS_REVOKED':'RECONNECT'})}\n\n`);close();}}
    };
    send(first);if(!closed)timer=setTimeout(tick,first.hasMore?0:1000);
  });
}
