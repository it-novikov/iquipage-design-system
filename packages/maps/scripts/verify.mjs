// One repeatable acceptance entry, with synthetic data and no production integrations.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {root,sha,fingerprint} from './fingerprint.mjs';
const artifact=path.join(root,'artifacts/final');await mkdir(artifact,{recursive:true});
const before=await fingerprint(),startedAt=new Date().toISOString(),checks=[];
const execute=(name,args)=>{
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});
  const output=(result.stdout||'')+(result.stderr||'');
  checks.push({name,exitCode:result.status,error:result.error?.message});
  return {result,output};
};
let failure,nodeTests=0,browserScenarios=0;
try{
  const testFiles=(await readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n);
  for(const [name,args] of [['build',['scripts/build.mjs']],['preview',['scripts/preview.mjs']],['node',['--test','--test-reporter=tap',...testFiles]],['browser',['scripts/test-browser.mjs']],['offline',['tests/preview-smoke.mjs']]]){
    const {result,output}=execute(name,args);await writeFile(path.join(artifact,name+'.log'),output);
    if(result.status!==0)throw Error(name+' failed; see artifacts/final/'+name+'.log: '+(result.error?.message||result.status));
    if(name==='node'){
      nodeTests=Number(output.match(/^# tests (\d+)$/m)?.[1]);
      if(!nodeTests||!/^# fail 0$/m.test(output))throw Error('Missing or failed Node test summary');
    }
    console.log('PASS '+name);
  }
  for(const name of ['artifacts/r3/browser-report.json','artifacts/final/browser-events.json','artifacts/final/browser-recovery.json','artifacts/r3/preview-report.json','artifacts/board-b1/layout.json','artifacts/board-b1/interactions.json','artifacts/board-b1/motion.json','artifacts/board-b2/browser.json','artifacts/board-b2/recovery.json','artifacts/attachment-core/browser-idb.json','artifacts/board-covers/browser.json','artifacts/thread-pages/browser.json','artifacts/editor-move/browser.json','artifacts/map-task-link/browser.json']){
    const report=JSON.parse(await readFile(path.join(root,name),'utf8'));
    if(report.status!=='PASS')throw Error('Required report did not pass: '+name);
    if(!name.includes('preview-report'))browserScenarios+=report.checks.length;
  }
  if((await fingerprint()).sha256!==before.sha256)throw Error('Source changed during acceptance');
}catch(error){failure=error;console.error(error.message);}
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const report={release:'Board-B2.1',status:failure?'FAIL':'PASS',startedAt,finishedAt:new Date().toISOString(),sourceCommit:git.status===0?git.stdout.trim():null,sourceFingerprint:before.sha256,node:process.version,nodeTests,browserScenarios,checks,error:failure?.message,scope:'reusable-module-and-local-reference',attachmentCoreValidated:!failure,coverUiReady:!failure,httpAttachmentRoutesEnabled:true,threadPaginationValidated:!failure,productionReady:false,limitations:['No production Sprintique API/auth deployment','No live LLM credentials or provider calls','No multi-user collaboration','Real touch devices, screen readers and Safari not accepted','Uploads use a local reference store; production AV/CDR and host authorization require integration','Virtualization, provider integrations and production host delivery remain pending','Thread list is paginated; one opened discussion loads its complete message history, and reference queries are in-memory','Headless motion sample is not a real-device FPS acceptance']};
try{report.previewSha256=sha(await readFile(path.join(root,'preview.html')));report.dsCandidate=JSON.parse(await readFile(path.join(root,'dist/candidate.json'),'utf8'));}catch(error){report.artifactError=error.message;report.status='FAIL';}
await writeFile(path.join(artifact,'verification.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(artifact,'fingerprint.json'),JSON.stringify(before,null,2)+'\n');
console.log(JSON.stringify({status:report.status,nodeTests,browserScenarios,sourceFingerprint:before.sha256}));
if(report.status!=='PASS')process.exitCode=1;
