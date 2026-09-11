import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=await mkdtemp(join(tmpdir(),'sprintique-extraction-'));
try{
  const source=resolve('products/sprintique');
  await cp(source,temp,{recursive:true,filter:path=>!/(?:^|\/)(?:node_modules|dist|build|output|\.playwright-cli)(?:\/|$)/.test(path.slice(source.length))});
  for(const args of [['ci','--ignore-scripts'],['run','check:boundaries'],['run','build'],['test']]){
    const result=spawnSync('npm',args,{cwd:temp,stdio:'inherit',env:process.env});
    if(result.status!==0)throw Error('Extraction verification failed: npm '+args.join(' '));
  }
  console.log('PASS: only products/sprintique copied; clean install, boundaries, strict build and PostgreSQL tests.');
}finally{await rm(temp,{recursive:true,force:true});}
