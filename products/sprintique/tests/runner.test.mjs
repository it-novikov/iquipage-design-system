import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {waitForChild} from '../scripts/child-exit.mjs';

test('R4-REL-01 child exit propagates success, failure and signal; removes forwarded listeners',async()=>{
  const listeners={SIGTERM:process.listenerCount('SIGTERM'),SIGINT:process.listenerCount('SIGINT'),SIGHUP:process.listenerCount('SIGHUP')};
  for(const [script,expected] of [['process.exit(0)',0],['process.exit(7)',7],['process.kill(process.pid,"SIGTERM")',1]]){
    const child=spawn(process.execPath,['-e',script],{stdio:'ignore'});
    assert.equal(await waitForChild(child,{forwardSignals:true}),expected);
    for(const signal of Object.keys(listeners))assert.equal(process.listenerCount(signal),listeners[signal]);
  }
});
test('R4-REL-01 spawn errors reject rather than report a green test run',async()=>{
  const child=spawn('/sprintique-test-nonexistent-executable',[],{stdio:'ignore'});
  await assert.rejects(waitForChild(child),{code:'ENOENT'});
});
test('R4-REL-01 forwarded interruption fails even when the child gracefully exits zero',{timeout:10000},async()=>{
  // Emit only inside a disposable parent process; never signal this test runner or services.
  for(const signal of ['SIGINT','SIGTERM','SIGHUP']){
    const script=`import {spawn} from 'node:child_process'; import {once} from 'node:events';
      import {waitForChild} from ${JSON.stringify(new URL('../scripts/child-exit.mjs',import.meta.url).href)};
      const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>process.exit(0));process.stdout.write("ready");setInterval(()=>{},1000)']);
      const result=waitForChild(child,{forwardSignals:true});
      await once(child.stdout,'data');process.emit(${JSON.stringify(signal)});process.exitCode=await result;`;
    const parent=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'ignore'});
    assert.equal(await waitForChild(parent),1);
  }
});
test('R4-REL-02 the startup sweep removes only clusters whose owning runner is gone',async()=>{
  const {mkdtemp,mkdir,writeFile,readdir,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {sweepOrphans,isOwnedDir}=await import('../scripts/cluster-guard.mjs');
  // A private root stands in for the system temp directory; nothing outside it is read or removed.
  const root=await mkdtemp(join(tmpdir(),'guard-root-'));
  try{
    const dead=spawn(process.execPath,['-e','0'],{stdio:'ignore'});await waitForChild(dead);
    const make=async(name,owner)=>{const dir=join(root,name);await mkdir(join(dir,'data'),{recursive:true});if(owner)await writeFile(join(dir,'runner.json'),JSON.stringify(owner));return dir;};
    const orphan=await make('sprintique-test-Orph01',{pid:dead.pid});
    const live=await make('sprintique-test-Live01',{pid:process.pid});
    await make('sprintique-test-Old001',null);
    await make('other-test-Orph02',{pid:dead.pid});
    assert.deepEqual(sweepOrphans({root}),[orphan]);
    assert.deepEqual((await readdir(root)).sort(),['other-test-Orph02','sprintique-test-Live01','sprintique-test-Old001']);
    assert.equal(isOwnedDir(live,root),true);assert.equal(isOwnedDir(join(root,'..'),root),false);assert.equal(isOwnedDir('/opt/homebrew/var/postgresql@16',root),false);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('R4-REL-02 the cluster guard stops the cluster and removes its directory once the runner dies, even by SIGKILL',{timeout:15000},async()=>{
  const {mkdtemp,mkdir,writeFile,chmod,access,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {startGuard}=await import('../scripts/cluster-guard.mjs');
  const root=await mkdtemp(join(tmpdir(),'guard-root-')),bin=join(root,'bin'),dir=join(root,'sprintique-test-Guard1');
  try{
    await mkdir(bin);await mkdir(join(dir,'data'),{recursive:true});await writeFile(join(dir,'data','postmaster.pid'),'1');
    // A stand-in pg_ctl records that the guard asked for a fast stop of exactly this data directory.
    await writeFile(join(bin,'pg_ctl'),`#!/bin/sh\necho "$@" > ${JSON.stringify(join(root,'stopped'))}\n`);await chmod(join(bin,'pg_ctl'),0o755);
    const runner=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    startGuard({dir,bin,root,pid:runner.pid,interval:.2});
    const gone=async path=>{try{await access(path);return false;}catch{return true;}};
    await new Promise(r=>setTimeout(r,500));assert.equal(await gone(dir),false,'the cluster stays while its runner lives');
    runner.kill('SIGKILL');await waitForChild(runner);
    for(let i=0;i<50&&!(await gone(dir));i++)await new Promise(r=>setTimeout(r,100));
    assert.equal(await gone(dir),true,'the directory is removed');
    const {readFile}=await import('node:fs/promises');assert.match(await readFile(join(root,'stopped'),'utf8'),new RegExp(`-D ${join(dir,'data').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} -m fast -w stop`));
  }finally{await rm(root,{recursive:true,force:true});}
});
