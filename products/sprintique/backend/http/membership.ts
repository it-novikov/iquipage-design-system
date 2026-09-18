import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {ChangeMember,CreateInvitation,AcceptInvitation,ChangeProfile} from '../../contracts/membership.js';
import * as members from '../application/membership.js';
export function registerMembershipRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId';
  app.get(base+'/members',r=>authenticated(r,(tx,a)=>members.projectMembers(tx,a,params(r).projectId)));
  app.patch(base+'/members/:id',r=>authenticated(r,(tx,a)=>{const p=params(r);return members.changeMember(tx,a,p.projectId,p.id!,ChangeMember.parse(r.body),mutationKey(r));}));
  app.get(base+'/invitations',r=>authenticated(r,(tx,a)=>members.invitations(tx,a,params(r).projectId)));
  app.post(base+'/invitations',r=>authenticated(r,(tx,a)=>members.createInvitation(tx,a,params(r).projectId,CreateInvitation.parse(r.body))));
  app.delete(base+'/invitations/:id',r=>authenticated(r,(tx,a)=>{const p=params(r);return members.revokeInvitation(tx,a,p.projectId,p.id!);}));
  app.post('/api/v1/invitations/accept',r=>authenticated(r,(tx,a)=>members.acceptInvitation(tx,a,AcceptInvitation.parse(r.body).token)));
  app.get('/api/v1/profile',r=>authenticated(r,members.profile));
  app.patch('/api/v1/profile',r=>authenticated(r,(tx,a)=>members.changeProfile(tx,a,ChangeProfile.parse(r.body))));
}
