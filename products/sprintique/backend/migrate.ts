import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {fileURLToPath} from 'node:url';

export async function migrate(url:string,runtimeRole:string){
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole))throw Error('Invalid runtime role name');
  const db=new pg.Client({connectionString:url});await db.connect();
  try{
    await db.query('SELECT pg_advisory_lock(715749236)');
    await db.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
      const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
      const sha=createHash('sha256').update(sql).digest('hex');
      const old=await db.query<{sha256:string}>('SELECT sha256 FROM public.schema_migrations WHERE name=$1',[name]);
      if(old.rows[0]){if(old.rows[0].sha256!==sha)throw Error('Applied migration checksum changed: '+name);continue;}
      await db.query('BEGIN');
      try{await db.query(sql);await db.query('INSERT INTO public.schema_migrations(name,sha256) VALUES($1,$2)',[name,sha]);await db.query('COMMIT');}
      catch(error){await db.query('ROLLBACK');throw error;}
    }
    // This identifier is validated above. Role is provisioned by infrastructure, never by an HTTP request.
    await db.query(`GRANT SELECT ON public.schema_migrations TO "${runtimeRole}";
      GRANT USAGE ON SCHEMA app,auth TO "${runtimeRole}";
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA app TO "${runtimeRole}";
      GRANT DELETE ON app.task_tags TO "${runtimeRole}";
      REVOKE UPDATE ON app.audit_events,app.messages,app.idempotency FROM "${runtimeRole}";
      REVOKE UPDATE ON app.planning_plans,app.planning_applied,app.release_snapshots FROM "${runtimeRole}";
      GRANT SELECT,INSERT,UPDATE ON auth.principals,auth.credentials TO "${runtimeRole}";
      GRANT SELECT,INSERT,DELETE ON auth.login_states TO "${runtimeRole}";
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO "${runtimeRole}"`);
  }finally{await db.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const url=process.env['MIGRATION_DATABASE_URL'],role=process.env['DATABASE_RUNTIME_ROLE'];
  if(!url||!role)throw Error('MIGRATION_DATABASE_URL and DATABASE_RUNTIME_ROLE required');
  await migrate(url,role);
}
