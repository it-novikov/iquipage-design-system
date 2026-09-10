import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export async function referenceServer(t,{seed,webhookSecret=''}={}){
  const dir=await mkdtemp(path.join(os.tmpdir(),'maps-final-http-'));
  if(seed)await seed(dir);
  const port=18000+Math.floor(Math.random()*25000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/app.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,MAPS_PORT:String(port),MAPS_DATA_DIR:dir,MAPS_LLM_GATEWAY:'',MAPS_LLM_GATEWAY_TOKEN:'',MAPS_WEBHOOK_SECRET:webhookSecret},stdio:['ignore','pipe','pipe']});
  let output='',exited=false;child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const done=new Promise(resolve=>child.once('exit',()=>{exited=true;resolve();}));
  t.after(async()=>{if(!exited){child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(timer);}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<150;i++){
    if(exited)throw Error('Reference server exited: '+output);
    try{if((await fetch(base+'/api/capabilities')).ok)break;}catch{}
    if(i===149)throw Error('Reference server not ready: '+output);
    await new Promise(r=>setTimeout(r,30));
  }
  const headers={'Content-Type':'application/json','X-Maps-Client':'reference'};
  const send=(url,body,method='POST')=>fetch(base+'/api'+url,{method,headers,body:JSON.stringify(body)});
  const get=async url=>(await fetch(base+'/api'+url)).json();
  const put=async(c,record,baseRevision=record.revision)=>{const response=await send(`/records/${c}/${record.id}`,{record,baseRevision},'PUT');const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message),{code:value.code});return value;};
  return {base,headers,get,put,send,dir};
}
export async function until(fn,predicate){
  for(let i=0;i<150;i++){const value=await fn();if(predicate(value))return value;await new Promise(r=>setTimeout(r,40));}
  throw Error('Timed out waiting for the expected persisted state');
}
