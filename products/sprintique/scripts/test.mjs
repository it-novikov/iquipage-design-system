import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import pg from 'pg';
const bin=process.env.PG_BIN||'/opt/homebrew/opt/postgresql@18/bin';
const dir=await mkdtemp(join(tmpdir(),'sprintique-test-'));
const socket=join(dir,'socket'),data=join(dir,'data');await mkdir(socket,{mode:0o700});
let started=false;
function command(name,args){const run=spawnSync(join(bin,name),args,{encoding:'utf8'});if(run.status!==0)throw Error(`${name} failed: ${run.stderr||run.error||run.stdout}`);}
try{
  // Isolated synthetic cluster: Unix socket only, no TCP listener, no existing databases.
  command('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);
  command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${socket} -h '' -p 5432`,'-w','start']);started=true;
  const url=user=>`postgresql://${user}@localhost/sprintique?host=${encodeURIComponent(socket)}`;
  const admin=new pg.Client({connectionString:url('postgres').replace('/sprintique?','/postgres?')});await admin.connect();
  await admin.query('CREATE ROLE sprintique_migrator LOGIN NOSUPERUSER NOBYPASSRLS');
  await admin.query('CREATE ROLE sprintique_app LOGIN NOSUPERUSER NOBYPASSRLS');
  await admin.query('CREATE DATABASE sprintique OWNER sprintique_migrator');await admin.end();
  const preview=process.argv.includes('--preview');
  const child=spawn(process.execPath,['--import','tsx',...(preview?['tests/preview.ts']:['--test','tests/api.test.ts'])],{
    stdio:'inherit',env:{...process.env,TEST_FIXTURE_DIR:dir,TEST_ADMIN_DATABASE_URL:url('postgres'),MIGRATION_DATABASE_URL:url('sprintique_migrator'),DATABASE_RUNTIME_ROLE:'sprintique_app',DATABASE_URL:url('sprintique_app')}
  });
  const stop=()=>child.kill('SIGTERM');process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});process.exitCode=code||0;
}finally{
  if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
  // Only the exact directory made above; never touch a user cluster.
  await rm(dir,{recursive:true,force:true});
}
