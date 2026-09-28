import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,origin,startApp} from './fixture.js';
import type {TestApp} from './support/kotlin-app.js';
import {startFakeOidcProvider,type FakeOidcProvider} from './support/fake-oidc-provider.js';
import {openMailbox,type Mailbox} from './support/mailbox.js';

// Sign-in the way people use it: a code by e-mail, Google and Apple against synthetic providers, and one person
// behind several ways in. The server under test has the mail drop, both providers and their shared test CA.
let f:Awaited<ReturnType<typeof fixture>>,app:TestApp,mailbox:Mailbox,google:FakeOidcProvider,apple:FakeOidcProvider,secrets:string;
const googleClient='google-client',appleClient='com.sprintique.web',teamId='TEAM123456',keyId='KEY1234567';
const signing=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...signing.publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const appleKey=generateKeyPairSync('ec',{namedCurve:'P-256'});
// What the providers put into the next ID token, and what they saw in the last request.
let googleClaims:Record<string,unknown>={},appleClaims:Record<string,unknown>={},nonce='',challenge='',badSignature=false;
const seen={googleVerifier:'',appleSecret:'',appleVerifier:null as string|null};

function idToken(issuer:string,audience:string,claims:Record<string,unknown>){
  const now=Math.floor(Date.now()/1000),part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const body=part({alg:'RS256',kid:'test-key'})+'.'+part({iss:issuer,aud:audience,iat:now,exp:now+60,nonce,...claims});
  return body+'.'+(badSignature?'invalid':sign('RSA-SHA256',Buffer.from(body),signing.privateKey).toString('base64url'));
}
function discovery(issuer:string,extra:Record<string,unknown>){
  return {issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],
    subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],...extra};
}
const googleProvider=(issuer:string)=>(url:string,body:string)=>{
  if(url.endsWith('/.well-known/openid-configuration'))return discovery(issuer,{code_challenge_methods_supported:['S256']});
  if(url.endsWith('/jwks'))return {keys:[jwk]};
  const form=new URLSearchParams(body);
  assert.equal(form.get('redirect_uri'),origin+'/auth/callback/google');assert.equal(form.get('client_secret'),'google-secret');
  seen.googleVerifier=form.get('code_verifier')??'';
  return {access_token:'unused',token_type:'Bearer',expires_in:60,id_token:idToken(issuer,googleClient,googleClaims)};
};
const appleProvider=(issuer:string)=>(url:string,body:string)=>{
  if(url.endsWith('/.well-known/openid-configuration'))return discovery(issuer,{response_modes_supported:['query','fragment','form_post']});
  if(url.endsWith('/jwks'))return {keys:[jwk]};
  const form=new URLSearchParams(body);
  assert.equal(form.get('redirect_uri'),origin+'/auth/callback/apple');
  seen.appleSecret=form.get('client_secret')??'';seen.appleVerifier=form.get('code_verifier');
  return {access_token:'unused',token_type:'Bearer',expires_in:60,id_token:idToken(issuer,appleClient,appleClaims)};
};

before(async()=>{
  f=await fixture({prefix:'SI'});
  [mailbox,google,apple]=await Promise.all([openMailbox(),startFakeOidcProvider(googleProvider),startFakeOidcProvider(appleProvider)]);
  secrets=await mkdtemp(join(tmpdir(),'sprintique-sign-in-'));
  const keyFile=join(secrets,'AuthKey.p8'),trust=join(secrets,'providers.pem');
  await writeFile(keyFile,appleKey.privateKey.export({format:'pem',type:'pkcs8'}));
  await writeFile(trust,(await readFile(google.trustFile,'utf8'))+(await readFile(apple.trustFile,'utf8')));
  // Behind one trusted proxy hop: every request below names its own client, so the per-address sign-in budget
  // (SI04 and operations.test.ts test it) does not throttle this file's many sign-ins.
  app=await startApp({origin,trustProxy:'1',mailDrop:mailbox.directory,providerTrust:trust,
    google:{issuer:google.issuer,clientId:googleClient,clientSecret:'google-secret'},
    apple:{issuer:apple.issuer,clientId:appleClient,teamId,keyId,privateKeyFile:keyFile}});
});
after(async()=>{await app?.close();await Promise.all([f?.close(),mailbox?.close(),google?.close(),apple?.close()]);if(secrets)await rm(secrets,{recursive:true,force:true});});

let clients=0;
const client=()=>{clients++;return `10.${clients>>16&255}.${clients>>8&255}.${clients&255}`;};
const json=(url:string,payload:unknown,headers:Record<string,string>={})=>app.inject({method:'POST',url,headers:{origin,'x-forwarded-for':client(),...headers},payload});
const cookieOf=(response:{headers:Record<string,unknown>},name:string)=>{
  const all=([] as string[]).concat(response.headers['set-cookie'] as string|string[]??[]);
  return all.find(cookie=>cookie.startsWith(name+'='))?.split(';')[0];
};
async function requestCode(email:string,from?:string){
  // The thirty-second wait between codes is SI04's subject; elsewhere earlier codes are moved back past it.
  await f.admin.query("UPDATE auth.email_challenges SET created_at=created_at-interval '1 minute' WHERE email=lower($1)",[email]);
  const response=await json('/auth/email/start',{email},from?{'x-forwarded-for':from}:{});assert.equal(response.statusCode,200,response.body);
  return cookieOf(response,'__Host-sprintique-email')!;
}
async function principalOf(session:string){
  const response=await app.inject({url:'/api/v1/session',headers:{cookie:session}});assert.equal(response.statusCode,200,response.body);
  return response.json().principal as {id:string;name:string};
}
async function signInByEmail(email:string){
  const challenge=await requestCode(email);
  const response=await json('/auth/email/verify',{code:await mailbox.code(email)},{cookie:challenge});
  assert.equal(response.statusCode,200,response.body);
  return cookieOf(response,'__Host-sprintique')!;
}
/** Starts a provider sign-in and returns the provider's callback answer (a redirect) for the given callback fields. */
async function providerSignIn(provider:'google'|'apple',fields:Record<string,string>={},options:{loginCookie?:string;method?:string}={}){
  const start=await app.inject({url:'/auth/login/'+provider,headers:{'x-forwarded-for':client()}});assert.equal(start.statusCode,302,start.body);
  const location=new URL(String(start.headers.location));
  nonce=location.searchParams.get('nonce')!;challenge=location.searchParams.get('code_challenge')??'';
  const state=location.searchParams.get('state')!,cookie=options.loginCookie??cookieOf(start,'__Host-sprintique-login')!;
  const form=new URLSearchParams({code:'good',state,...fields});
  const callback=provider==='apple'&&options.method!=='GET'
    ?await app.inject({method:'POST',url:'/auth/callback/apple',headers:{cookie,'content-type':'application/x-www-form-urlencoded',origin:'https://appleid.apple.com','x-forwarded-for':client()},payload:form.toString()})
    :await app.inject({url:`/auth/callback/${provider}?${form}`,headers:{cookie,'x-forwarded-for':client()}});
  return {start,location,state,callback,session:cookieOf(callback,'__Host-sprintique')};
}

test('SI01 the sign-in screen is told which ways in exist',async()=>{
  assert.deepEqual((await app.inject('/api/v1/auth/methods')).json(),{email:true,google:true,apple:true,devLogin:false});
});

test('SI02 a code from a letter opens a session; the first code creates the person, the next ones find them',async()=>{
  const email='Maria.Ivanova@Example.org',normalized='maria.ivanova@example.org';
  const challenge=await requestCode(email);
  const [letter]=await mailbox.letters(normalized);
  assert.match(letter!.subject,/^Код для входа в Sprintique: \d{6}$/);assert.ok(letter!.text.includes(origin));
  const verified=await json('/auth/email/verify',{code:await mailbox.code(normalized)},{cookie:challenge});
  assert.equal(verified.statusCode,200,verified.body);
  assert.match(String(verified.headers['set-cookie']),/__Host-sprintique=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  const first=await principalOf(cookieOf(verified,'__Host-sprintique')!);assert.equal(first.name,'maria.ivanova');
  const again=await principalOf(await signInByEmail(normalized));assert.equal(again.id,first.id);
  const stored=(await f.admin.query("SELECT p.email,i.issuer FROM auth.principals p JOIN auth.identities i ON i.principal_id=p.id WHERE p.id=$1",[first.id])).rows;
  assert.deepEqual(stored,[{email:normalized,issuer:'urn:sprintique:email'}]);
  // A used code is spent.
  assert.equal((await json('/auth/email/verify',{code:await mailbox.code(normalized)},{cookie:challenge})).json().code,'EMAIL_CODE_EXPIRED');
});

test('SI03 a code works only in the asking browser, for ten minutes and five attempts',async()=>{
  const email='attempts@example.org',challenge=await requestCode(email),code=await mailbox.code(email);
  const wrong=String((Number(code)+1)%1000000).padStart(6,'0');
  assert.equal((await json('/auth/email/verify',{code})).json().code,'EMAIL_CODE_EXPIRED','no challenge cookie');
  assert.equal((await json('/auth/email/verify',{code},{cookie:'__Host-sprintique-email='+'x'.repeat(43)})).json().code,'EMAIL_CODE_EXPIRED','another browser');
  assert.equal((await json('/auth/email/verify',{code:'12345'},{cookie:challenge})).statusCode,400,'malformed code');
  for(const left of [4,3,2,1]){
    const response=await json('/auth/email/verify',{code:wrong},{cookie:challenge});
    assert.equal(response.json().code,'EMAIL_CODE_INVALID');assert.match(response.json().message,new RegExp(`Осталось попыток: ${left}`));
  }
  assert.equal((await json('/auth/email/verify',{code:wrong},{cookie:challenge})).json().code,'EMAIL_CODE_EXPIRED','the fifth wrong code ends it');
  assert.equal((await json('/auth/email/verify',{code},{cookie:challenge})).json().code,'EMAIL_CODE_EXPIRED','even the right code is too late');
  // Expiry: a challenge past its ten minutes refuses the right code.
  const late='late@example.org',lateChallenge=await requestCode(late);
  await f.admin.query("UPDATE auth.email_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE email=$1",[late]);
  assert.equal((await json('/auth/email/verify',{code:await mailbox.code(late)},{cookie:lateChallenge})).json().code,'EMAIL_CODE_EXPIRED');
  // A new code from the same client replaces that client's previous one.
  const replaced='replaced@example.org',old=await requestCode(replaced,'10.202.0.1'),oldCode=await mailbox.code(replaced);
  await requestCode(replaced,'10.202.0.1');
  assert.equal((await json('/auth/email/verify',{code:oldCode},{cookie:old})).json().code,'EMAIL_CODE_EXPIRED');
});

test('SI04 codes are asked for only from the app, for a real address, and not too often from one client',async()=>{
  assert.equal((await json('/auth/email/start',{email:'a@example.org'},{origin:'https://evil.example'})).statusCode,403);
  assert.equal((await json('/auth/email/verify',{code:'123456'},{origin:'https://evil.example'})).statusCode,403);
  assert.equal((await json('/auth/email/start',{email:'not an address'})).json().code,'EMAIL_INVALID');
  assert.equal((await json('/auth/email/start',{email:'a@example.org',extra:true})).statusCode,400);
  // One code per 30 seconds and five an hour for an address from one client; someone else is neither blocked
  // nor cancels that client's code.
  const me='10.200.0.1',other='10.200.0.2',hash=(ip:string)=>createHash('sha256').update(ip).digest('hex');
  const mine=await json('/auth/email/start',{email:'often@example.org'},{'x-forwarded-for':me});assert.equal(mine.statusCode,200);
  const soon=await json('/auth/email/start',{email:'often@example.org'},{'x-forwarded-for':me});assert.equal(soon.statusCode,429);assert.equal(soon.json().code,'EMAIL_CODE_WAIT');
  assert.equal((await json('/auth/email/start',{email:'often@example.org'},{'x-forwarded-for':other})).statusCode,200);
  const firstCode=(await mailbox.letters('often@example.org'))[0]!.text.match(/код для входа в Sprintique: (\d{6})/)![1]!;
  assert.equal((await json('/auth/email/verify',{code:firstCode},{cookie:cookieOf(mine,'__Host-sprintique-email')!})).statusCode,200,'the first code still works');
  await f.admin.query("INSERT INTO auth.email_challenges(token_hash,email,code_hash,client_hash,created_at,expires_at) SELECT md5(n::text)||md5(n::text),'busy@example.org',md5(n::text)||md5(n::text),$1,clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '1 minute' FROM generate_series(1,5) n",[hash(me)]);
  const limited=await json('/auth/email/start',{email:'busy@example.org'},{'x-forwarded-for':me});assert.equal(limited.statusCode,429);assert.equal(limited.json().code,'EMAIL_CODE_LIMIT');
  assert.equal((await json('/auth/email/start',{email:'busy@example.org'},{'x-forwarded-for':other})).statusCode,200,'another client is not locked out');
  // Twenty codes a day for an address from anywhere bound the guessing.
  await f.admin.query("INSERT INTO auth.email_challenges(token_hash,email,code_hash,client_hash,created_at,expires_at) SELECT md5('d'||n)||md5('d'||n),'daily@example.org',md5('d'||n)||md5('d'||n),md5('c'||n)||md5('c'||n),clock_timestamp()-interval '3 hours',clock_timestamp()-interval '2 hours' FROM generate_series(1,20) n");
  const daily=await json('/auth/email/start',{email:'daily@example.org'});assert.equal(daily.statusCode,429);assert.equal(daily.json().code,'EMAIL_CODE_LIMIT');
  assert.deepEqual(await mailbox.letters('daily@example.org'),[]);
});

test('SI05 Google: PKCE, state and nonce are checked, and a Gmail address joins the account of the same address',async()=>{
  const person=await principalOf(await signInByEmail('same.person@gmail.com'));
  googleClaims={sub:'google-1',email:'Same.Person@gmail.com',email_verified:true,name:'Same Person'};
  const flow=await providerSignIn('google');
  assert.equal(flow.location.searchParams.get('prompt'),'select_account');assert.match(flow.location.searchParams.get('scope')!,/email/);
  assert.equal(flow.callback.statusCode,302,flow.callback.body);assert.equal(flow.callback.headers.location,'/');
  assert.equal(createHash('sha256').update(seen.googleVerifier).digest('base64url'),challenge,'PKCE verifier');
  assert.equal((await principalOf(flow.session!)).id,person.id,'joined by the verified Gmail address');
  // The same browser state cannot finish a second time.
  const replay=await app.inject({url:`/auth/callback/google?code=good&state=${flow.state}`,headers:{cookie:cookieOf(flow.start,'__Host-sprintique-login')!}});
  assert.equal(replay.headers.location,'/?sign-in-error=LOGIN_STATE');
  assert.equal((await providerSignIn('google',{},{loginCookie:'__Host-sprintique-login=wrong'})).callback.headers.location,'/?sign-in-error=LOGIN_STATE');
  assert.equal((await providerSignIn('google',{error:'access_denied'})).callback.headers.location,'/?sign-in-error=LOGIN_CANCELLED');
  badSignature=true;
  try{assert.equal((await providerSignIn('google')).callback.headers.location,'/?sign-in-error=LOGIN_INVALID');}finally{badSignature=false;}
  const start=await app.inject({url:'/auth/login/google',headers:{'x-forwarded-for':client()}});const state=new URL(String(start.headers.location)).searchParams.get('state');nonce='another';
  const wrongNonce=await app.inject({url:`/auth/callback/google?code=good&state=${state}`,headers:{cookie:cookieOf(start,'__Host-sprintique-login')!}});
  assert.equal(wrongNonce.headers.location,'/?sign-in-error=LOGIN_INVALID');
});

test('SI06 Google addresses outside Gmail join an account only when Google Workspace vouches for them',async()=>{
  const person=await principalOf(await signInByEmail('someone@company.example'));
  googleClaims={sub:'google-2',email:'someone@company.example',email_verified:true,name:'Someone'};
  const unvouched=await principalOf((await providerSignIn('google')).session!);
  assert.notEqual(unvouched.id,person.id);
  assert.equal((await f.admin.query('SELECT email FROM auth.principals WHERE id=$1',[unvouched.id])).rows[0].email,null);
  const colleague=await principalOf(await signInByEmail('colleague@company.example'));
  googleClaims={sub:'google-3',email:'colleague@company.example',email_verified:true,name:'Colleague',hd:'company.example'};
  assert.equal((await principalOf((await providerSignIn('google')).session!)).id,colleague.id);
  googleClaims={sub:'google-4',email:'unverified@gmail.com',email_verified:false,name:'Unverified'};
  const unverified=await principalOf((await providerSignIn('google')).session!);
  assert.equal((await f.admin.query('SELECT email FROM auth.principals WHERE id=$1',[unverified.id])).rows[0].email,null);
});

test('SI07 Apple: a form-posted callback, a signed client secret and the name Apple sends once',async()=>{
  appleClaims={sub:'apple-1',email:'x7k2@privaterelay.appleid.com',email_verified:'true',is_private_email:'true'};
  const flow=await providerSignIn('apple',{user:JSON.stringify({name:{firstName:'Анна',lastName:'Смирнова'},email:'forged@example.org'})});
  assert.equal(flow.location.searchParams.get('response_mode'),'form_post');assert.equal(flow.location.searchParams.get('code_challenge'),null);
  assert.match(String(flow.start.headers['set-cookie']),/__Host-sprintique-login=[^;]+; Path=\/; HttpOnly; Secure; SameSite=None/);
  assert.equal(flow.callback.statusCode,302,flow.callback.body);assert.equal(flow.callback.headers.location,'/');
  const person=await principalOf(flow.session!);assert.equal(person.name,'Анна Смирнова');
  assert.equal((await f.admin.query('SELECT email FROM auth.principals WHERE id=$1',[person.id])).rows[0].email,'x7k2@privaterelay.appleid.com');
  // The client secret: ES256 by the team's key, about the Services ID, for Apple, short-lived.
  const [header,payload,signature]=seen.appleSecret.split('.') as [string,string,string];
  assert.deepEqual(JSON.parse(Buffer.from(header,'base64url').toString()),{kid:keyId,alg:'ES256'});
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.iss,teamId);assert.equal(claims.sub,appleClient);assert.equal(claims.aud,apple.issuer);assert.ok(claims.exp-claims.iat<=300);
  assert.ok(verify('SHA256',Buffer.from(header+'.'+payload),{key:appleKey.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
  assert.equal(seen.appleVerifier,null,'no PKCE where the provider does not announce it');
  // Later sign-ins carry no name and keep the person; a callback by GET is not Apple's.
  const again=await providerSignIn('apple');assert.equal((await principalOf(again.session!)).id,person.id);
  assert.equal((await principalOf(again.session!)).name,'Анна Смирнова');
  assert.equal((await providerSignIn('apple',{},{method:'GET'})).callback.headers.location,'/?sign-in-error=LOGIN_INVALID');
});

test('SI08 a disabled person cannot sign in by any way',async()=>{
  const email='disabled@gmail.com',person=await principalOf(await signInByEmail(email));
  await f.admin.query('UPDATE auth.principals SET disabled_at=now() WHERE id=$1',[person.id]);
  const challenge=await requestCode(email);
  const refused=await json('/auth/email/verify',{code:await mailbox.code(email)},{cookie:challenge});
  assert.equal(refused.statusCode,403);assert.equal(refused.json().code,'ACCOUNT_DISABLED');
  googleClaims={sub:'google-disabled',email,email_verified:true,name:'Disabled'};
  assert.equal((await providerSignIn('google')).callback.headers.location,'/?sign-in-error=ACCOUNT_DISABLED');
});

test('SI09 the mail drop stays off production, and production needs SMTP',async()=>{
  await assert.rejects(startApp({origin,environment:'production'}),/Production requires SMTP/);
  await assert.rejects(startApp({origin:'https://sprintique.example',mailDrop:mailbox.directory}),/loopback/);
  await assert.rejects(startApp({origin,settings:{SPRINTIQUE_SMTP_HOST:'smtp.example.org',SPRINTIQUE_SMTP_SECURITY:'none',SPRINTIQUE_MAIL_FROM:'no-reply@example.org'}}),/loopback relay/);
});

test('SI10 a percent-encoded path counts against the same sign-in budget',async()=>{
  const ip='10.201.0.1';
  for(let attempt=0;attempt<20;attempt++)await app.inject({url:'/auth/login/google',headers:{'x-forwarded-for':ip}});
  const encoded=await app.inject({url:'/%61uth/login/google',headers:{'x-forwarded-for':ip}});
  assert.equal(encoded.statusCode,429,encoded.body);
});
