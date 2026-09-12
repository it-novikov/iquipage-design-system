import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceInputs,fingerprint,changedInputs,sha256} from './vnext/source-inputs.mjs';
const root=resolve('.'),out=resolve('products/sprintique/output/verification',new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
const before=await sourceInputs(root);
await writeFile(join(out,'sources.json'),JSON.stringify(before,null,2)+'\n');
const results=[];
const commands=[
  ['verification-tools','.',process.execPath,['--test','scripts/vnext/source-inputs.test.mjs']],
  ['library-build','libraries/iquipage','npm',['run','build']],
  ['library-tests','libraries/iquipage','npm',['test']],
  ['product-boundaries','products/sprintique','npm',['run','check:boundaries']],
  ['product-build','products/sprintique','npm',['run','build']],
  ['product-tests','products/sprintique','npm',['test']],
  ['detached-product','.',process.execPath,['scripts/verify-extraction.mjs']]
];
for(const [name,cwd,command,args] of commands){
  const run=spawnSync(command,args,{cwd:resolve(cwd),encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
  const passed=run.status===0&&!run.signal&&!run.error;
  const log=(run.stdout||'')+(run.stderr||'')+(run.error?'\nProcess failed: '+run.error.message+'\n':'');await writeFile(join(out,name+'.log'),log);
  results.push({name,exitCode:run.status,signal:run.signal,passed,log:name+'.log'});
  console.log(name+': '+(passed?'PASS':'FAIL'));
  if(!passed){console.error(log);process.exitCode=1;break;}
}
const after=await sourceInputs(root),drift=changedInputs(before,after);
await writeFile(join(out,'sources-after.json'),JSON.stringify(after,null,2)+'\n');
await writeFile(join(out,'source-stability.log'),drift.length?'FAIL: source changed during verification\n'+drift.join('\n')+'\n':'PASS: all source/build inputs unchanged during verification\n');
results.push({name:'source-stability',passed:drift.length===0,log:'source-stability.log'});
if(drift.length){process.exitCode=1;console.error('FAIL: source changed during verification; results cannot certify the final working tree.');}
const pkg=JSON.parse(await readFile('products/sprintique/package.json','utf8')),release=pkg.dependencies['@iquipage/web'];
if(typeof release!=='string'||!/^file:vendor\/[A-Za-z0-9._-]+\.tgz$/.test(release))throw Error('Expected an explicit product-local DS release');
const record={schema:2,date:new Date().toISOString(),node:process.version,sourceFingerprint:fingerprint(before),finalSourceFingerprint:fingerprint(after),sourceStable:drift.length===0,
  dsTarballSha256:sha256(await readFile(resolve('products/sprintique',release.slice(5)))),checks:results,fullPlatformReady:false,productionTouched:false};
await writeFile(join(out,'verification.json'),JSON.stringify(record,null,2)+'\n');
console.log(out);
