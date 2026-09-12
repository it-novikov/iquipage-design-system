import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {authorize} from '../infrastructure/database.js';
import {manageProject} from '../application/membership.js';
import {idempotent,recordEvent} from '../application/commands.js';
import {requireCondition} from '../domain/errors.js';
import {RetryJob} from '../../contracts/operations.js';
export function registerOperations(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId/operations';
  app.get(base,r=>authenticated(r,async(tx,a)=>{
    const {projectId}=params(r);await authorize(tx,a,projectId,'agents:manage');
    const counts=(await tx.query('SELECT kind,state,count(*)::int AS count FROM work.jobs WHERE project_id=$1 GROUP BY kind,state ORDER BY kind,state',[projectId])).rows;
    const jobs=(await tx.query(`SELECT id,kind,state,attempts,last_error AS "errorCode",available_at AS "availableAt",lease_until AS "leaseUntil",created_at AS "createdAt"
      FROM work.jobs WHERE project_id=$1 AND state IN ('pending','running','failed') ORDER BY CASE WHEN state='failed' THEN 0 WHEN state='running' THEN 1 ELSE 2 END,available_at,id LIMIT 50`,[projectId])).rows;
    return {counts,jobs,limit:50,eventDelivery:'durable-pull-and-sse',externalPushConfigured:false};
  }));
  app.post(base+'/jobs/:id/retry',r=>authenticated(r,async(tx,a)=>{
    const {projectId,id}=params(r),jobId=z.uuid().parse(id),input=RetryJob.parse(r.body);await manageProject(tx,a,projectId);
    return idempotent(tx,a,projectId,'job.retry:'+jobId,mutationKey(r),input,async()=>{
      const result=(await tx.query<{ok:boolean}>('SELECT work.retry_asset_job($1,$2) AS ok',[projectId,jobId])).rows[0];
      requireCondition(result?.ok,409,'JOB_STATE','Операция уже завершена, выполняется или недоступна.');
      await recordEvent(tx,a,projectId,'job.retried',jobId,1);return {id:jobId,state:'pending'};
    });
  }));
}
