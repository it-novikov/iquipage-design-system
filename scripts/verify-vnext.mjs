import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve('.'),out=resolve('products/sprintique/output/verification',new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
const results=[];
const commands=[
  ['library-build','libraries/iquipage','npm',['run','build']],
  ['library-tests','libraries/iquipage','npm',['test']],
  ['product-boundaries','products/sprintique','npm',['run','check:boundaries']],
  ['product-build','products/sprintique','npm',['run','build']],
  ['product-tests','products/sprintique','npm',['test']],
  ['detached-product','.',process.execPath,['scripts/verify-extraction.mjs']]
];
for(const [name,cwd,command,args] of commands){
  const run=spawnSync(command,args,{cwd:resolve(cwd),encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
  const log=(run.stdout||'')+(run.stderr||'');await writeFile(join(out,name+'.log'),log);
  results.push({name,exitCode:run.status,passed:run.status===0,log:name+'.log'});
  console.log(name+': '+(run.status===0?'PASS':'FAIL'));
  if(run.status!==0){console.error(log);process.exitCode=1;break;}
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=[];
for(const folder of ['libraries/iquipage','products/sprintique','scripts']){
  for(const name of (await readdir(folder,{recursive:true})).sort()){
    if(/(?:^|\/)(node_modules|dist|build|output|\.playwright-cli)(?:\/|$)/.test(name))continue;
    if(!/\.(?:ts|js|mjs|cjs|css|sql|json|tgz)$/.test(name))continue;
    const path=folder+'/'+name;source.push({path,sha256:sha(await readFile(path))});
  }
}
const record={schema:1,date:new Date().toISOString(),node:process.version,sourceFingerprint:sha(JSON.stringify(source)),dsTarballSha256:sha(await readFile('products/sprintique/vendor/iquipage-web-0.6.0-vnext.1.tgz')),checks:results,fullPlatformReady:false,productionTouched:false};
await writeFile(join(out,'sources.json'),JSON.stringify(source,null,2)+'\n');
await writeFile(join(out,'verification.json'),JSON.stringify(record,null,2)+'\n');
console.log(out);
