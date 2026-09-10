// Reproducible local browser suite. Never uses a user's working database.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=await mkdtemp(path.join(os.tmpdir(),'iquipage-r3-browser-'));
const port=22000+Math.floor(Math.random()*20000);
const env={...process.env,MAPS_PORT:String(port),MAPS_DATA_DIR:directory,MAPS_LLM_GATEWAY:'',MAPS_LLM_GATEWAY_TOKEN:'',MAPS_WEBHOOK_SECRET:'',MAPS_TEST_URL:`http://127.0.0.1:${port}`};
const server=spawn(process.execPath,['server/app.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let exited=false;const exit=new Promise(resolve=>server.once('exit',()=>{exited=true;resolve();}));
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Local test server did not start within 10 seconds')),10000);
    let output='';server.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Maps reference:')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',chunk=>process.stderr.write(chunk));
    server.once('error',e=>{clearTimeout(timer);reject(e);});
    server.once('exit',code=>{clearTimeout(timer);reject(Error('Local server exited before readiness: '+code));});
  });
  for(const suite of ['tests/browser-r3.mjs','tests/browser-events-final.mjs','tests/browser-delivery-recovery.mjs','tests/browser-board-b1.mjs','tests/browser-board-interactions.mjs','tests/browser-board-motion.mjs','tests/browser-board-b2.mjs','tests/browser-board-b2-recovery.mjs'])await new Promise((resolve,reject)=>{
    const test=spawn(process.execPath,[suite],{cwd:root,env,stdio:'inherit'});
    test.once('error',reject);test.once('exit',code=>code===0?resolve():reject(Error('Browser suite failed: '+code)));
  });
}finally{
  if(!exited){server.kill('SIGTERM');await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,5000))]);}
  if(!exited){server.kill('SIGKILL');await exit;}
  await rm(directory,{recursive:true,force:true});
}
