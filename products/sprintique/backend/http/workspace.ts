import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {PutTaskSettings,PutTaskLink,SearchQuery,PutProjectProfile,PutWorkspaceProfile} from '../../contracts/workspace.js';
import {ChangeWorkspaceMember} from '../../contracts/membership.js';
import {z} from 'zod';
import * as profiles from '../application/project-profile.js';
import * as workspace from '../application/workspace.js';
export function registerWorkspaceRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId';
  app.get(base+'/profile',r=>authenticated(r,(tx,a)=>profiles.projectProfile(tx,a,params(r).projectId)));
  app.put(base+'/profile',r=>authenticated(r,(tx,a)=>profiles.putProjectProfile(tx,a,params(r).projectId,PutProjectProfile.parse(r.body),mutationKey(r))));
  const workspaceParams=(value:unknown)=>z.object({workspaceId:z.uuid(),id:z.string().min(1).max(100).optional()}).parse(value);
  app.get('/api/v1/workspaces/:workspaceId',r=>authenticated(r,(tx,a)=>profiles.workspaceProfile(tx,a,workspaceParams(r.params).workspaceId)));
  app.patch('/api/v1/workspaces/:workspaceId',r=>authenticated(r,(tx,a)=>profiles.putWorkspaceProfile(tx,a,workspaceParams(r.params).workspaceId,PutWorkspaceProfile.parse(r.body))));
  app.get('/api/v1/workspaces/:workspaceId/members',r=>authenticated(r,(tx,a)=>profiles.workspaceMembers(tx,a,workspaceParams(r.params).workspaceId)));
  app.patch('/api/v1/workspaces/:workspaceId/members/:id',r=>authenticated(r,(tx,a)=>{const p=workspaceParams(r.params);return profiles.changeWorkspaceMember(tx,a,p.workspaceId,p.id!,ChangeWorkspaceMember.parse(r.body));}));
  app.get(base+'/task-settings',r=>authenticated(r,(tx,a)=>workspace.taskSettings(tx,a,params(r).projectId)));
  app.put(base+'/task-settings',r=>authenticated(r,(tx,a)=>workspace.writeTaskSettings(tx,a,params(r).projectId,PutTaskSettings.parse(r.body),mutationKey(r))));
  app.get(base+'/task-links',r=>authenticated(r,(tx,a)=>workspace.taskLinks(tx,a,params(r).projectId)));
  app.put(base+'/task-links/:id',r=>authenticated(r,(tx,a)=>{const p=params(r);return workspace.writeTaskLink(tx,a,p.projectId,p.id!,PutTaskLink.parse(r.body),mutationKey(r));}));
  app.get('/api/v1/search',r=>authenticated(r,(tx,a)=>{const q=SearchQuery.parse(r.query);return workspace.search(tx,a,q.q,q.cursor);}));
}
