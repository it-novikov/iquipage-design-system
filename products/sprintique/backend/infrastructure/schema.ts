import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Database} from './database.js';
import {requireCondition} from '../domain/errors.js';
let required:Promise<Map<string,string>>|undefined;
export async function checkSchema(db:Database){
  required ||= (async()=>{
    const root=new URL('../../migrations/',import.meta.url),items=new Map<string,string>();
    for(const name of (await readdir(root)).filter(n=>n.endsWith('.sql')).sort())items.set(name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'));
    if(!items.size)throw Error('Migration files missing from runtime artifact');return items;
  })();
  const expected=await required,actual=new Map((await db.pool.query<{name:string;sha256:string}>('SELECT name,sha256 FROM public.schema_migrations')).rows.map(r=>[r.name,r.sha256]));
  requireCondition(expected.size===actual.size&&[...expected].every(([name,sha])=>actual.get(name)===sha),503,'SCHEMA_MISMATCH','Версия схемы не соответствует серверу. Выполните миграции перед запуском.');
}
