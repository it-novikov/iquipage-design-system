import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import pg from 'pg';
const context=process.env.SPRINTIQUE_DOCKER_CONTEXT;if(!context)throw Error('Explicit SPRINTIQUE_DOCKER_CONTEXT is required for Docker tests');
if(process.argv.includes('--preview'))throw Error('Docker test mode does not launch a fixture UI. Use local:start with real OIDC.');
const name='sprintique-test-'+randomBytes(8).toString('hex'),dir=await mkdtemp(join(tmpdir(),'sprintique-test-'));
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let created=false;
try{
  // Trust is restricted to an ephemeral, loopback-published synthetic cluster. Never used by local:start or production.
  docker('create','--name',name,'--label','sprintique.owner=ephemeral-test','--publish','127.0.0.1::5432','--memory','512m','--cpus','1','--env','POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af');created=true;docker('start',name);
  const port=Number(docker('port',name,'5432/tcp').split(':').at(-1));if(!port)throw Error('Ephemeral PostgreSQL port missing');
  const url=(user,database='sprintique')=>`postgresql://${user}@127.0.0.1:${port}/${database}`;
  let admin;
  for(let attempt=0;attempt<60;attempt++){
    const candidate=new pg.Client({connectionString:url('postgres','postgres'),connectionTimeoutMillis:1000});
    try{await candidate.connect();admin=candidate;break;}catch{await candidate.end().catch(()=>{});await setTimeout(500);}
  }
  if(!admin)throw Error('Ephemeral PostgreSQL not ready');
  try{for(const role of ['sprintique_migrator','sprintique_app','sprintique_worker'])await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query('CREATE DATABASE sprintique OWNER sprintique_migrator');}finally{await admin.end();}
  const tests=(await readdir('tests')).filter(name=>/\.test\.(ts|mjs)$/.test(name)).sort().map(name=>'tests/'+name);
  const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...tests],{stdio:'inherit',env:{...process.env,
    TEST_FIXTURE_DIR:dir,TEST_ADMIN_DATABASE_URL:url('postgres'),MIGRATION_DATABASE_URL:url('sprintique_migrator'),DATABASE_RUNTIME_ROLE:'sprintique_app',DATABASE_WORKER_ROLE:'sprintique_worker',DATABASE_URL:url('sprintique_app'),WORKER_DATABASE_URL:url('sprintique_worker')}});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{
  if(created){docker('stop','--time','10',name);docker('rm','--volumes',name);}
  await rm(dir,{recursive:true,force:true});
}
