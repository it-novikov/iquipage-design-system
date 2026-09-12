/** Install the private library tarball in a clean consumer; never publish it. */
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const library=fileURLToPath(new URL('../../work-list/',import.meta.url));
const temporary=await mkdtemp(path.join(tmpdir(),'iquipage-work-list-consumer-'));
const run=(cmd,args,cwd)=>{const result=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:90000});if(result.status!==0)throw Error((result.stderr||result.stdout||result.error?.message||'Failed consumer command'));return result.stdout;};
try{
  const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',temporary],library))[0];
  if(packed.files.some(f=>/\.(woff2?|ttf|otf|eot)$/.test(f.path)))throw Error('Font binary in package');
  await writeFile(path.join(temporary,'package.json'),JSON.stringify({name:'isolated-work-list-consumer',private:true,type:'module'}));
  run('npm',['install','--ignore-scripts','--no-fund','--no-audit','--package-lock=false',path.join(temporary,packed.filename)],temporary);
  run(process.execPath,['--input-type=module','-e',`import {WindowIndex,TableWindow,bindRowDrag} from '@iquipage/work-list';
    const index=new WindowIndex(['a','b'],72);index.measure(0,100);
    if(index.total!==172||index.indexAt(100)!==1||typeof TableWindow!=='function'||typeof bindRowDrag!=='function')throw Error('Broken public exports');`],temporary);
  const css=await readFile(path.join(temporary,'node_modules/@iquipage/work-list/src/work-list.css'),'utf8');
  if(!css.includes('--iq-motion-fast'))throw Error('Missing host-token stylesheet');
  console.log('PASS clean tarball install, public ESM exports, independent index and host stylesheet');
}finally{await rm(temporary,{recursive:true,force:true});}
