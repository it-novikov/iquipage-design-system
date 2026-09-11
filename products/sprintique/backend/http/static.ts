import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {Problem} from '../domain/errors.js';
export function serveWeb(app:FastifyInstance,dist=resolve('dist')){
  app.addHook('onSend',async(_request,reply)=>{
    reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  });
  app.get('/',async(_request,reply)=>reply.type('text/html').send(await readFile(resolve(dist,'index.html'))));
  app.get<{Params:{file:string}}>('/assets/:file',async(request,reply)=>{
    const name=request.params.file;
    if(!/^[A-Za-z0-9_-]+\.(js|css|woff2|webp|png|svg)$/.test(name))throw new Problem(404,'NOT_FOUND','Файл недоступен.');
    const types:Record<string,string>={js:'text/javascript',css:'text/css',woff2:'font/woff2',webp:'image/webp',png:'image/png',svg:'image/svg+xml'};
    try{return reply.type(types[name.split('.').at(-1)!]!).send(await readFile(resolve(dist,'assets',name)));}
    catch{throw new Problem(404,'NOT_FOUND','Файл недоступен.');}
  });
}
