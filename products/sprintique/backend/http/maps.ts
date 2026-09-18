import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {MapPage,PutMap,PutMapTemplate} from '../../contracts/maps.js';
import {z} from 'zod';
import * as maps from '../application/maps.js';
export function registerMapRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId';
  app.get(base+'/maps',r=>authenticated(r,(tx,a)=>maps.listMaps(tx,a,params(r).projectId,MapPage.parse(r.query).cursor)));
  app.get(base+'/maps/:id',r=>authenticated(r,(tx,a)=>{const p=params(r);return maps.readMap(tx,a,p.projectId,p.id!);}));
  app.get(base+'/maps/:id/history',r=>authenticated(r,(tx,a)=>{const p=params(r),q=z.strictObject({before:z.coerce.number().int().positive().max(2147483647).optional()}).parse(r.query);return maps.mapHistory(tx,a,p.projectId,p.id!,q.before);}));
  app.get(base+'/maps/:id/history/:revision',r=>authenticated(r,(tx,a)=>{const p=params(r),revision=z.coerce.number().int().positive().max(2147483647).parse((r.params as Record<string,unknown>)['revision']);return maps.mapVersion(tx,a,p.projectId,p.id!,revision);}));
  app.put(base+'/maps/:id',{bodyLimit:2*1024*1024},r=>authenticated(r,(tx,a)=>{const p=params(r);return maps.writeMap(tx,a,p.projectId,p.id!,PutMap.parse(r.body),mutationKey(r));}));
  app.get(base+'/map-templates',r=>authenticated(r,(tx,a)=>maps.listTemplates(tx,a,params(r).projectId)));
  app.put(base+'/map-templates/:id',{bodyLimit:2*1024*1024},r=>authenticated(r,(tx,a)=>{const p=params(r);return maps.writeTemplate(tx,a,p.projectId,p.id!,PutMapTemplate.parse(r.body),mutationKey(r));}));
}
