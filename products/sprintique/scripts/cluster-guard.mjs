import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';

/** Lifetime guards for the synthetic PostgreSQL clusters the test and preview runner creates.
 *  Everything here acts only on directories this runner family owns: `<tmpdir>/sprintique-test-XXXXXX`
 *  that carry a `runner.json`. Any other PostgreSQL instance (for example a Homebrew service) is never touched. */
const OWNED=/^sprintique-test-[A-Za-z0-9]{6}$/;
export const RUNNER_FILE='runner.json';

export function isOwnedDir(dir,root=tmpdir()){
  return typeof dir==='string'&&dirname(dir)===root&&OWNED.test(basename(dir));
}
function requireOwned(dir,root){if(!isOwnedDir(dir,root))throw Error(`Refusing to manage a directory outside ${root}/sprintique-test-*: ${dir}`);}

export function alive(pid){
  if(!Number.isInteger(pid)||pid<=1)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}
}

/** Records which runner owns the cluster, so a later run (or the guard) can tell an orphan from a live run. */
export function writeOwner(dir,{root=tmpdir(),pid=process.pid}={}){
  requireOwned(dir,root);
  writeFileSync(join(dir,RUNNER_FILE),JSON.stringify({pid,startedAt:new Date().toISOString()})+'\n',{mode:0o600});
}

/** Stops the cluster in `dir/data` (if it still runs) and removes `dir`. Synchronous, idempotent, never throws. */
export function stopCluster(dir,{bin,root=tmpdir()}={}){
  requireOwned(dir,root);
  const data=join(dir,'data');
  if(bin&&existsSync(join(data,'postmaster.pid')))spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore',timeout:30000});
  rmSync(dir,{recursive:true,force:true});
}

/** Startup sweep: clusters whose owning runner is gone (a SIGKILL, a crash, a reboot of the parent) are stopped
 *  and their directories removed. Directories without runner.json belong to older runners and are left alone. */
export function sweepOrphans({bin,root=tmpdir(),exclude=null}={}){
  const swept=[];
  let names=[];try{names=readdirSync(root);}catch{return swept;}
  for(const name of names){
    const dir=join(root,name);
    if(dir===exclude||!isOwnedDir(dir,root))continue;
    let owner;try{owner=JSON.parse(readFileSync(join(dir,RUNNER_FILE),'utf8'));}catch{continue;}
    if(alive(owner?.pid))continue;
    stopCluster(dir,{bin,root});swept.push(dir);
  }
  return swept;
}

/** A detached watchdog that outlives even SIGKILL of the runner: once the runner process is gone it stops the
 *  cluster and removes the directory. After a normal exit the runner has already cleaned up and the guard's
 *  commands find nothing to do. */
export function startGuard({dir,bin,root=tmpdir(),pid=process.pid,interval=2}){
  requireOwned(dir,root);
  const script='while kill -0 "$1" 2>/dev/null; do sleep "$5"; done; if [ -f "$3/postmaster.pid" ]; then "$2" -D "$3" -m fast -w stop >/dev/null 2>&1; fi; rm -rf "$4"';
  const guard=spawn('/bin/sh',['-c',script,'sprintique-cluster-guard',String(pid),join(bin,'pg_ctl'),join(dir,'data'),dir,String(interval)],{detached:true,stdio:'ignore'});
  guard.unref();
  return guard;
}

/** Calls `onGone` once when this process is re-parented (its launcher, such as npm, died without taking it along). */
export function watchParent(onGone,{interval=1000}={}){
  const original=process.ppid;
  const timer=setInterval(()=>{if(process.ppid!==original){clearInterval(timer);onGone();}},interval);
  timer.unref();
  return ()=>clearInterval(timer);
}
