import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {ChangeMember,CreateInvitation,AcceptInvitation,ChangeProfile} from '../../contracts/membership.js';
import * as members from '../application/membership.js';
import {FILE_LIMIT} from '../../contracts/media.js';
import {processAvatar} from '../domain/files.js';
import {requireCondition} from '../domain/errors.js';
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
  // The person's own photo. The caller is authenticated before any image is decoded, and again for the write.
  app.put('/api/v1/profile/avatar',{bodyLimit:FILE_LIMIT},async r=>{
    await authenticated(r,async(_tx,a)=>{requireCondition(a.kind==='human',403,'FORBIDDEN','Фото профиля доступно человеку.');});
    requireCondition(Buffer.isBuffer(r.body),400,'FILE_BODY','Передайте изображение.');
    const image=await processAvatar(r.body);
    return authenticated(r,(tx,a)=>members.setAvatar(tx,a,image));
  });
  app.delete('/api/v1/profile/avatar',r=>authenticated(r,members.removeAvatar));
  app.get('/api/v1/people/:id/avatar',async(r,reply)=>{
    const id=String((r.params as Record<string,unknown>)['id']??'');requireCondition(/^[A-Za-z0-9._:-]{1,200}$/.test(id),404,'NOT_FOUND','Фото недоступно.');
    const row=await authenticated(r,(tx,a)=>members.readAvatar(tx,a,id));
    const version=(r.query as Record<string,unknown>|undefined)?.['v'];
    // A URL that names the current revision never changes; any other request revalidates.
    reply.type('image/webp').header('Content-Security-Policy',"default-src 'none'; sandbox")
      .header('Cache-Control',version!==undefined&&String(version)===String(row.revision)?'private, max-age=31536000, immutable':'private, no-cache');
    return reply.send(row.image);
  });
}
