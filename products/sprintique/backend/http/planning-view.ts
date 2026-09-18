import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params} from './app.js';
import {Id} from '../../contracts/index.js';
import {ViewQuery,ViewRowsQuery,ViewSelectQuery,ViewOptionsQuery,ViewIntent} from '../../contracts/planning-view.js';
import * as view from '../application/planning-view.js';

/** POST query endpoints carry structured bounded filters; they never execute commands. */
export function registerPlanningViewRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId/planning/view';
  app.post(base+'/groups',r=>authenticated(r,(tx,actor)=>view.groups(tx,actor,params(r).projectId,ViewQuery.parse(r.body))));
  app.post(base+'/rows',r=>authenticated(r,(tx,actor)=>view.rows(tx,actor,params(r).projectId,ViewRowsQuery.parse(r.body))));
  app.post(base+'/timeline',r=>authenticated(r,(tx,actor)=>view.timeline(tx,actor,params(r).projectId,ViewQuery.parse(r.body))));
  app.post(base+'/selection',r=>authenticated(r,(tx,actor)=>view.selectMatching(tx,actor,params(r).projectId,ViewSelectQuery.parse(r.body))));
  app.post(base+'/options',r=>authenticated(r,(tx,actor)=>view.options(tx,actor,params(r).projectId,ViewOptionsQuery.parse(r.body))));
  app.post(base+'/release',r=>authenticated(r,(tx,actor)=>{const q=z.strictObject({groupId:Id,cursor:z.string().max(3000).optional()}).parse(r.body);return view.describeRelease(tx,actor,params(r).projectId,q.groupId,q.cursor);}));
  app.get(base+'/settings',r=>authenticated(r,(tx,actor)=>view.settings(tx,actor,params(r).projectId)));
  app.post(base+'/preview',r=>authenticated(r,(tx,actor)=>view.previewIntent(tx,actor,params(r).projectId,ViewIntent.parse(r.body))));
}
