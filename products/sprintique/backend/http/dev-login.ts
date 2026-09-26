import type {FastifyInstance} from 'fastify';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
import {Database,hash,secret} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {cookieValue,sessionCookie} from './oidc.js';

/** Local debugging account. Its principal is keyed by this issuer, never by a real identity provider. */
export const DEV_ISSUER='urn:sprintique:local-dev';
export const DEV_SUBJECT='admin';
export const DEV_NAME='Администратор';
const DevLogin=z.strictObject({username:z.string().max(100),password:z.string().max(100)});
const same=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());

/** Fails closed: the fixed admin/admin login exists only outside production and only on a loopback origin. */
export function assertDevLoginAllowed(origin:string){
  if(process.env['NODE_ENV']==='production')throw Error('Local dev login is never available in production');
  if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local dev login requires a loopback PUBLIC_ORIGIN');
}

export function registerDevLogin(app:FastifyInstance,db:Database,origin:string){
  assertDevLoginAllowed(origin);
  app.post('/auth/dev-login',async(request,reply)=>{
    requireCondition(request.headers.origin===origin,403,'CSRF','Обновите страницу и войдите заново.');
    const input=DevLogin.parse(request.body);
    requireCondition(same(input.username,'admin')&&same(input.password,'admin'),401,'LOGIN_INVALID','Неверный логин или пароль.');
    const token=secret(),csrf=secret();
    await db.transaction(async tx=>{
      const principal=(await tx.query<{id:string}>(`INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,$3,$4)
        ON CONFLICT(issuer,subject) DO UPDATE SET disabled_at=NULL RETURNING id`,[randomUUID(),DEV_NAME,DEV_ISSUER,DEV_SUBJECT])).rows[0]!;
      await tx.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,clock_timestamp()+interval '8 hours')",[randomUUID(),principal.id,hash(token),csrf]);
    });
    reply.header('Set-Cookie',cookieValue(sessionCookie,token,28800));
    return {ok:true};
  });
}
