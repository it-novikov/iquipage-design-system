import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {authorize} from '../infrastructure/database.js';
import {PutTag,PutRelease} from '../../contracts/index.js';
import {idempotent,recordEvent} from '../application/commands.js';
import {requireCondition} from '../domain/errors.js';

export function registerCatalogRoutes(app:FastifyInstance,authenticated:Authenticated){
  // Fixed two-table mapping is code-owned, never table names from the network.
  for(const collection of ['tags','releases'] as const){
    const fields=collection==='tags'?'name,tone':`name,status,to_char(target_date,'YYYY-MM-DD') AS "targetDate"`;
    const projection=`id,project_id AS "projectId",revision,archived_at AS "archivedAt",${fields}`;
    app.get(`/api/v1/projects/:projectId/${collection}`,request=>authenticated(request,async(tx,actor)=>{
      const {projectId}=params(request);await authorize(tx,actor,projectId,'tasks:read');
      const rows=(await tx.query(`SELECT ${projection} FROM app.${collection} WHERE project_id=$1 ORDER BY name,id LIMIT 501`,[projectId])).rows;
      requireCondition(rows.length<=500,409,'CATALOG_LIMIT','Каталог достиг лимита.');return rows;
    }));
    app.put(`/api/v1/projects/:projectId/${collection}/:id`,request=>authenticated(request,async(tx,actor)=>{
      const {projectId,id}=params(request);await authorize(tx,actor,projectId,'catalog:write');
      const input=collection==='tags'?PutTag.parse(request.body):PutRelease.parse(request.body);
      return idempotent(tx,actor,projectId,collection+':'+id,mutationKey(request),input,async()=>{
        await tx.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[projectId]);
        const previous=(await tx.query<{revision:number}>(`SELECT revision FROM app.${collection} WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
        requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Каталог уже изменён.');
        const count=(await tx.query<{count:number}>(`SELECT count(*)::int AS count FROM app.${collection} WHERE project_id=$1`,[projectId])).rows[0]!.count;
        requireCondition(previous||count<500,409,'CATALOG_LIMIT','Каталог достиг лимита.');
        const value=input.value;
        if('tone' in value)await tx.query(`INSERT INTO app.tags(project_id,id,name,tone,archived_at,revision) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(project_id,id) DO UPDATE SET name=$3,tone=$4,archived_at=$5,revision=app.tags.revision+1`,[projectId,id,value.name,value.tone,value.archivedAt]);
        else await tx.query(`INSERT INTO app.releases(project_id,id,name,status,target_date,archived_at,revision) VALUES($1,$2,$3,$4,$5,$6,1) ON CONFLICT(project_id,id) DO UPDATE SET name=$3,status=$4,target_date=$5,archived_at=$6,revision=app.releases.revision+1`,[projectId,id,value.name,value.status,value.targetDate,value.archivedAt]);
        await recordEvent(tx,actor,projectId,collection+'.updated',id!,input.baseRevision+1);
        return (await tx.query(`SELECT ${projection} FROM app.${collection} WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
      });
    }));
  }
}
