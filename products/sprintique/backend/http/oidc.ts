import * as oidc from 'openid-client';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {Database,hash,secret} from '../infrastructure/database.js';
import {Problem,requireCondition} from '../domain/errors.js';

export interface OidcSettings {issuer:string;clientId:string;clientSecret:string;origin:string;transport?:oidc.CustomFetch}
export const sessionCookie='__Host-sprintique';
export function cookie(request:FastifyRequest,name:string){
  return request.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
}
export const cookieValue=(name:string,value:string,maxAge:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export async function registerOidc(app:FastifyInstance,db:Database,settings:OidcSettings|undefined){
  // No placeholder login, no trust of browser-provided actor IDs. Absence is explicit and fail-closed.
  let configuration:Promise<oidc.Configuration>|undefined;
  const config=()=>{
    requireCondition(settings,503,'IDENTITY_NOT_CONFIGURED','OIDC-провайдер ещё не настроен.');
    configuration??=oidc.discovery(new URL(settings.issuer),settings.clientId,settings.clientSecret,undefined,settings.transport?{[oidc.customFetch]:settings.transport}:undefined)
      .then(client=>{oidc.enableNonRepudiationChecks(client);return client;})
      .catch(error=>{configuration=undefined;throw error;});
    return configuration;
  };
  app.get('/auth/login',async(_request,reply)=>{
    const client=await config(),state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier();
    await db.pool.query("INSERT INTO auth.login_states(state_hash,verifier,nonce,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes')",[hash(state),verifier,nonce]);
    const url=oidc.buildAuthorizationUrl(client,{redirect_uri:settings!.origin+'/auth/callback',scope:'openid profile',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
    reply.header('Set-Cookie',cookieValue('__Host-sprintique-login',state,600));
    return reply.redirect(url.href);
  });
  app.get('/auth/callback',async(request,reply)=>{
    const client=await config(),url=new URL(request.url,settings!.origin),state=url.searchParams.get('state');
    requireCondition(state&&state===cookie(request,'__Host-sprintique-login'),400,'LOGIN_STATE','Сессия входа устарела. Начните вход заново.');
    const pending=(await db.pool.query<{verifier:string;nonce:string}>('DELETE FROM auth.login_states WHERE state_hash=$1 AND expires_at>clock_timestamp() RETURNING verifier,nonce',[hash(state)])).rows[0];
    requireCondition(pending,400,'LOGIN_STATE','Сессия входа устарела.');
    const tokens=await oidc.authorizationCodeGrant(client,url,{pkceCodeVerifier:pending.verifier,expectedState:state,expectedNonce:pending.nonce,idTokenExpected:true})
      .catch(()=>{throw new Problem(401,'LOGIN_INVALID','Не удалось подтвердить вход. Начните заново.');});
    const claims=tokens.claims();requireCondition(claims?.sub,401,'IDENTITY_INVALID','Не удалось подтвердить аккаунт.');
    const token=secret(),csrf=secret();
    await db.transaction(async tx=>{
      const principal=(await tx.query<{id:string;disabled_at:Date|null}>(`INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,$3,$4)
        ON CONFLICT(issuer,subject) DO UPDATE SET name=EXCLUDED.name RETURNING id,disabled_at`,[randomUUID(),String(claims.name||'Участник').slice(0,100),settings!.issuer,claims.sub])).rows[0]!;
      requireCondition(!principal.disabled_at,403,'ACCOUNT_DISABLED','Аккаунт отключён.');
      await tx.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,clock_timestamp()+interval '8 hours')",[randomUUID(),principal.id,hash(token),csrf]);
    });
    reply.header('Set-Cookie',[cookieValue(sessionCookie,token,28800),cookieValue('__Host-sprintique-login','',0)]);
    return reply.redirect('/');
  });
}
