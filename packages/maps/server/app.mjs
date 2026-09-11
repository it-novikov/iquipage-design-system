import http from 'node:http';
import {readFile,stat,mkdir,open,unlink,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FileRepository} from './file-repository.mjs';
import {FileAttachmentStore} from './attachment-store.mjs';
import {attachmentRoutes} from './attachment-http.mjs';
import {OutboxWorker} from './outbox.mjs';
import {WorkflowRuntime,localTasksAdapter} from '../src/runtime.js';
import {EventService,verifyWebhook} from './event-service.mjs';
import {validateRule} from '../src/events.js';
import {DomainError,requireValue,validId} from '../src/common.js';
import {COLLECTIONS} from '../src/model.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.MAPS_PORT||4317);
const directory=path.resolve(process.env.MAPS_DATA_DIR||path.join(root,'.dev-state'));
await mkdir(directory,{recursive:true,mode:0o700});
const lockPath=path.join(directory,'server.lock');
try{const prior=JSON.parse(await readFile(lockPath,'utf8'));try{process.kill(prior.pid,0);throw new Error('Этот каталог уже обслуживается процессом '+prior.pid);}catch(e){if(e.code!=='ESRCH')throw e;await rename(lockPath,lockPath+'.stale-'+Date.now());}}
catch(e){if(e.code!=='ENOENT')throw e;}
const lock=await open(lockPath,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lock.close();
const repository=await new FileRepository(directory).init();
const attachmentStore=await new FileAttachmentStore(repository).init();
const routeAttachments=attachmentRoutes(attachmentStore);
const adapters={createTasks:localTasksAdapter(repository)};
const gateway=process.env.MAPS_LLM_GATEWAY;
if(gateway){
  const url=new URL(gateway);requireValue(url.protocol==='https:'&&!url.username&&!url.password,'GATEWAY_CONFIG','Gateway должен использовать HTTPS без credentials в URL.');
  adapters.llm=async({input,prompt,connectionRef,signal})=>{
    const response=await fetch(url,{method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/json',...(process.env.MAPS_LLM_GATEWAY_TOKEN?{Authorization:'Bearer '+process.env.MAPS_LLM_GATEWAY_TOKEN}:{})},body:JSON.stringify({input,prompt,connectionRef,outputSchema:'actions/title-v1'})});
    if(!response.ok)throw new DomainError('LLM_GATEWAY','Gateway вернул ошибку '+response.status);return response.json();
  };
}
const runtime=new WorkflowRuntime(repository,adapters),events=new EventService(repository,runtime);
for(const run of [...repository.data.runs.values()])if(['running','queued'].includes(run.status)){run.status='interrupted';run.error={code:'RESTART',message:'Стенд перезапущен. Проверьте журнал перед повтором.'};await repository.write('runs',run,run.revision);}
const outbox=new OutboxWorker(repository,events);
const capabilities={attachments:true,transactionalEvents:true,storage:'server',runtimeScope:'local-reference',collaboration:false,events:true,schedule:true,webhook:!!process.env.MAPS_WEBHOOK_SECRET,llm:!!gateway,tasks:true,identity:'reference-user',warning:'Локальный стенд. Это не production API Sprintique.'};
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req){
  let size=0,parts=[];for await(const part of req){size+=part.length;requireValue(size<=16*1024*1024,'BODY_LIMIT','Запрос превышает 16 МБ.');parts.push(part);}return Buffer.concat(parts).toString('utf8');
}
function assertWrite(req){
  requireValue(req.headers['x-maps-client']==='reference','CSRF','Неподдерживаемый клиент записи.');
  const origin=req.headers.origin;
  requireValue(!origin||origin===`http://${req.headers.host}`,'CSRF','Запрос с другого origin отклонён.');
  requireValue((req.headers['content-type']||'').startsWith('application/json'),'CONTENT_TYPE','Требуется JSON.');
}
function recordAccess(value,projectId){requireValue(!value||value.projectId===projectId,'PROJECT_MISMATCH','Запись недоступна в этом проекте.');}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
  try{
    const host=new URL('http://'+(req.headers.host||'invalid')).hostname;
    requireValue(['127.0.0.1','localhost','[::1]'].includes(host),'HOST','Стенд доступен только через localhost.');
    const url=new URL(req.url,'http://localhost'),parts=url.pathname.split('/').filter(Boolean);
    if(parts[0]==='api'){
      if(req.method==='OPTIONS')throw new DomainError('CSRF','Cross-origin запросы не поддерживаются.');
      if(parts[1]==='capabilities'&&req.method==='GET')return send(res,200,capabilities);
      if(await routeAttachments(req,res,url,parts,send))return;
      if(parts[1]==='tasks'&&parts[3]==='threads'&&parts.length===4&&req.method==='GET'){
        const projectId=url.searchParams.get('projectId'),taskId=parts[2];
        requireValue(validId(projectId)&&validId(taskId),'THREAD_TASK','Не задана задача.');
        const result=await repository.pageThreads(projectId,taskId,{cursor:url.searchParams.get('cursor'),limit:Number(url.searchParams.get('limit')||20)});
        return send(res,200,result);
      }
      if(parts[1]==='event-deliveries'&&req.method==='GET'){
        const projectId=url.searchParams.get('projectId');requireValue(validId(projectId),'INVALID_PROJECT','Не задан проект.');
        const mapId=url.searchParams.get('mapId');
        requireValue(!mapId||validId(mapId),'INVALID_MAP','Некорректная карта.');
        return send(res,200,await repository.listDeliveries(projectId,mapId));
      }
      if(parts[1]==='hooks'&&parts.length===3&&req.method==='POST'){
        const raw=await readBody(req);verifyWebhook(raw,req.headers['x-maps-timestamp'],req.headers['x-maps-signature'],process.env.MAPS_WEBHOOK_SECRET);
        const rule=repository.data.rules.get(parts[2]);requireValue(rule?.trigger==='webhook'&&rule.status==='enabled','NOT_FOUND','Активное правило не найдено.');
        const event=JSON.parse(raw);recordAccess(rule,event.projectId);return send(res,200,await events.dispatch(rule,event));
      }
      let body;
      if(req.method!=='GET'){assertWrite(req);body=JSON.parse(await readBody(req));}
      if(parts[1]==='event-deliveries'&&req.method==='POST'&&parts.length===4){
        requireValue(validId(body.projectId),'INVALID_PROJECT','Не задан проект.');
        return send(res,200,await repository.recoverEvent(parts[2],body.projectId,parts[3],body.baseRevision));
      }
      if(parts[1]==='records'){
        const collection=parts[2],id=parts[3],projectId=url.searchParams.get('projectId');
        requireValue(COLLECTIONS.includes(collection)&&collection!=='attachments','NOT_FOUND','Коллекция не найдена.');
        if(req.method==='GET'){
          requireValue(validId(projectId),'INVALID_PROJECT','Не задан проект.');
          return send(res,200,id?await repository.read(collection,id,projectId):await repository.list(collection,projectId));
        }
        requireValue(req.method==='PUT'&&id&&collection!=='runs','METHOD','Эта запись изменяется только исполнителем.');
        requireValue(body.record.id===id,'INVALID_ID','Идентификатор URL не совпадает с документом.');
        if(collection==='rules'){
          const errors=validateRule(body.record);requireValue(!errors.length,'INVALID_RULE',errors.map(x=>x.message).join(' '));
          if(body.record.status==='enabled'){
            requireValue(capabilities[body.record.trigger]!==false,'NOT_CONNECTED','Этот источник событий не подключён.');
            const map=await repository.read('maps',body.record.mapId,body.record.projectId);
            requireValue(map&&map.status!=='archived'&&map.revision===body.record.mapRevision,'CONFLICT','Перед включением обновите версию сценария.');
            body.record.flowSnapshot=structuredClone(map.flow);
          }
        }
        return send(res,200,await repository.write(collection,body.record,body.baseRevision));
      }
      if(parts[1]==='runs'&&req.method==='POST'){
        if(parts.length===2){
          const map=await repository.read('maps',body.mapId,body.projectId);
          requireValue(map&&map.status!=='archived','NOT_FOUND','Активная карта не найдена.');
          requireValue(map.revision===body.mapRevision,'CONFLICT','Карта изменилась. Проверьте новую версию перед запуском.');
          return send(res,200,await runtime.start({...body,flow:map.flow,actorId:'reference-user',id:undefined,trigger:null}));
        }
        requireValue(['approve','cancel','retry'].includes(parts[3]),'METHOD','Неизвестное действие запуска.');
        const result=parts[3]==='approve'?await runtime.approve(parts[2],body.projectId,{...body,actorId:'reference-user'}):await runtime[parts[3]](parts[2],body.projectId);
        return send(res,200,result);
      }
      if(parts[1]==='events'&&req.method==='POST')return send(res,200,await events.projectEvent(body));
      throw new DomainError('NOT_FOUND','API-маршрут не найден.');
    }
    requireValue(req.method==='GET'||req.method==='HEAD','METHOD','Метод не поддерживается.');
    const pathname=decodeURIComponent(['/','/demo/'].includes(url.pathname)?'/demo/index.html':url.pathname);
    requireValue(['/demo/','/src/','/dist/'].some(prefix=>pathname.startsWith(prefix)),'NOT_FOUND','Ресурс не найден.');
    const filename=path.resolve(root,'.'+pathname);
    requireValue(filename.startsWith(root+path.sep)&&!pathname.includes('..'),'NOT_FOUND','Ресурс не найден.');
    const extension=path.extname(filename),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
    requireValue(types[extension]&&(await stat(filename)).isFile(),'NOT_FOUND','Файл не найден.');
    res.writeHead(200,{'Content-Type':types[extension],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(filename));
  }catch(error){
    const status=['NOT_FOUND','ENOENT'].includes(error.code)?404:['CONFLICT','EVENT_CONFLICT','ARCHIVED','FILE_CONFLICT'].includes(error.code)?409:['HOST','CSRF','PROJECT_MISMATCH','HOOK_SIGNATURE','HOOK_EXPIRED','FILE_ACCESS'].includes(error.code)?403:400;
    if(!res.headersSent)send(res,status,{code:error.code||'REQUEST_ERROR',message:error.message||'Не удалось обработать запрос.'});else res.end();
  }
});
let ticking=false;
const deliveries=setInterval(()=>outbox.drain().catch(e=>console.error('Event delivery:',e.code||'FAILED')),1000);deliveries.unref();
const scheduler=setInterval(async()=>{if(ticking)return;ticking=true;try{await events.tick();}catch(e){console.error('Scheduler:',e.code||e.message);}finally{ticking=false;}},10000);scheduler.unref();
server.listen(port,'127.0.0.1',()=>console.log(`Maps reference: http://127.0.0.1:${port}/\nLocal-only runtime; no production account or deployment. PID ${process.pid}`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(scheduler);clearInterval(deliveries);server.close();if(outbox.active)await outbox.active.catch(()=>{});await repository.queue.catch(()=>{});await unlink(lockPath).catch(()=>{});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.on('error',async e=>{await unlink(lockPath).catch(()=>{});console.error(e.message);process.exitCode=1;clearInterval(scheduler);clearInterval(deliveries);});
