import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,readdir} from 'node:fs/promises';
import {tmpdir,constants} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import pg from 'pg';
import {waitForChild,FORWARDED_SIGNALS} from './child-exit.mjs';
import {startGuard,stopCluster,sweepOrphans,watchParent,writeOwner} from './cluster-guard.mjs';

/** The local object storage the API tests use: TEST_S3_CONFIG, else the owned local stand's config when present. */
const s3Config=()=>process.env.TEST_S3_CONFIG?resolve(process.env.TEST_S3_CONFIG):existsSync('output/infra/storage.json')?resolve('output/infra/storage.json'):'';
if(process.env.SPRINTIQUE_TEST_DOCKER==='1'){
  await import('./test-docker.mjs');
}else{
const bin=process.env.PG_BIN||'/opt/homebrew/opt/postgresql@18/bin';
// A signal, a hang-up or a dead launcher must never leave the synthetic cluster running: these handlers stay for
// the whole run (so the default action never kills the runner mid-setup), the child gets the signal through
// waitForChild, and the finally block below stops the cluster and removes its directory.
let interrupted=null;
class Interrupted extends Error {}
const onSignal=signal=>{if(interrupted===null)interrupted=128+(constants.signals[signal]||15);};
for(const signal of FORWARDED_SIGNALS)process.on(signal,onSignal);
const checkpoint=()=>{if(interrupted!==null)throw new Interrupted();};
// A launcher (npm, a preview host) that dies without taking the runner along leaves it re-parented: treat that
// as a hang-up, which also reaches the child through waitForChild.
const stopWatching=watchParent(()=>process.kill(process.pid,'SIGHUP'));
// Clusters of earlier runners that were killed outright (their guard stops them too; this is the backstop).
sweepOrphans({bin});
const dir=await mkdtemp(join(tmpdir(),'sprintique-test-'));
const socket=join(dir,'socket'),data=join(dir,'data');await mkdir(socket,{mode:0o700});
writeOwner(dir);
function command(name,args){const run=spawnSync(join(bin,name),args,{encoding:'utf8',env:{...process.env,LC_ALL:'C',LANG:'C'}});if(run.status!==0)throw Error(`${name} failed: ${run.stderr||run.error||run.stdout}`);}
try{
  checkpoint();
  // Isolated synthetic cluster: Unix socket only, no TCP listener, no existing databases.
  command('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);checkpoint();
  // The guard outlives even SIGKILL of this runner and stops the cluster once the runner is gone.
  startGuard({dir,bin});
  command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${socket} -h '' -p 5432`,'-w','start']);checkpoint();
  const url=user=>`postgresql://${user}@localhost/sprintique?host=${encodeURIComponent(socket)}`;
  const admin=new pg.Client({connectionString:url('postgres').replace('/sprintique?','/postgres?')});await admin.connect();
  try{
    await admin.query('CREATE ROLE sprintique_migrator LOGIN NOSUPERUSER NOBYPASSRLS');
    await admin.query('CREATE ROLE sprintique_app LOGIN NOSUPERUSER NOBYPASSRLS');
    await admin.query('CREATE ROLE sprintique_worker LOGIN NOSUPERUSER NOBYPASSRLS');
    await admin.query('CREATE DATABASE sprintique OWNER sprintique_migrator');
  }finally{await admin.end();}
  checkpoint();
  const settingsPreview=process.argv.includes('--settings-preview'),preview=settingsPreview||process.argv.includes('--preview');
  // The server: check the published contract export, build the local artifact, apply the migration ledger, run the
  // Kotlin integration tests against this same isolated cluster. No Docker is involved.
  const exported=spawnSync(process.execPath,['--import','tsx','scripts/export-contracts.ts','--check'],{stdio:'inherit'});
  if(exported.status!==0)throw Error('Public contract schemas are out of date');
  const server=await import('./kotlin-server.mjs');
  server.buildServer();checkpoint();
  server.migrate({migrationUrl:url('sprintique_migrator'),runtimeRole:'sprintique_app',workerRole:'sprintique_worker'});checkpoint();
  // --jooq regenerates src/generated/jooq from this freshly migrated database and stops.
  if(process.argv.includes('--jooq')){
    server.gradle(['generateJooq'],{SPRINTIQUE_TEST_ADMIN_DATABASE_URL:url('postgres')});
    process.exitCode=0;
  }else if(!preview&&!process.argv.includes('--skip-integration')){
    server.integrationTests({SPRINTIQUE_TEST_ADMIN_DATABASE_URL:url('postgres'),SPRINTIQUE_TEST_MIGRATION_DATABASE_URL:url('sprintique_migrator'),
      SPRINTIQUE_TEST_DATABASE_URL:url('sprintique_app'),SPRINTIQUE_TEST_WORKER_DATABASE_URL:url('sprintique_worker'),
      SPRINTIQUE_TEST_RUNTIME_ROLE:'sprintique_app',SPRINTIQUE_TEST_WORKER_ROLE:'sprintique_worker',
      ...(s3Config()?{SPRINTIQUE_TEST_S3_CONFIG:s3Config()}:{})});
    checkpoint();
  }
  // --kotlin-only stops after the Kotlin checks above, without the Node suites.
  if(process.argv.includes('--kotlin-only')||process.argv.includes('--jooq')){process.exitCode??=0;}else{
  // --only=a.test.ts,b.test.ts runs a subset.
  const only=process.argv.find(argument=>argument.startsWith('--only='))?.slice(7).split(',');
  const tests=(await readdir('tests')).filter(name=>/\.test\.(ts|mjs)$/.test(name)&&(!only||only.includes(name))).sort().map(name=>'tests/'+name);
  checkpoint();
  const child=spawn(process.execPath,['--import','tsx',...(preview?[settingsPreview?'tests/settings-preview.ts':'tests/preview.ts']:['--test','--test-concurrency=1',...tests])],{
    stdio:'inherit',env:{...process.env,TEST_FIXTURE_DIR:dir,TEST_ADMIN_DATABASE_URL:url('postgres'),MIGRATION_DATABASE_URL:url('sprintique_migrator'),DATABASE_RUNTIME_ROLE:'sprintique_app',DATABASE_WORKER_ROLE:'sprintique_worker',DATABASE_URL:url('sprintique_app'),WORKER_DATABASE_URL:url('sprintique_worker')}
  });
  const code=await waitForChild(child,{forwardSignals:true});
  process.exitCode=interrupted??code;
  }
}catch(error){
  if(!(error instanceof Interrupted))throw error;
  process.exitCode=interrupted;
}finally{
  stopWatching();
  // Only the exact directory made above; never touch a user cluster. Synchronous, so no later signal can cut it short.
  stopCluster(dir,{bin});
  for(const signal of FORWARDED_SIGNALS)process.off(signal,onSignal);
}
}
