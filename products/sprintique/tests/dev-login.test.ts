import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,kotlin,origin,startApp} from './fixture.js';
import {createApp} from '../backend/http/app.js';
import {seedDevData} from './dev-seed.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'D',devLogin:true});});after(async()=>{await f?.close();});
const login=(payload:unknown,headers:Record<string,string>={origin})=>f.app.inject({method:'POST',url:'/auth/dev-login',headers,payload:payload as Record<string,unknown>});

test('D01 dev login is absent unless explicitly enabled, and the sign-in screen is told so',async()=>{
  const plain=kotlin?await startApp({origin}):await createApp({db:f.db,origin});
  try{
    assert.equal((await plain.inject({method:'POST',url:'/auth/dev-login',headers:{origin},payload:{username:'admin',password:'admin'}})).statusCode,404);
    assert.deepEqual((await plain.inject({method:'GET',url:'/api/v1/auth/methods'})).json(),{oidc:false,devLogin:false});
  }finally{await plain.close();}
  assert.deepEqual((await f.app.inject({method:'GET',url:'/api/v1/auth/methods'})).json(),{oidc:false,devLogin:true});
});
test('D02 dev login is refused in production and on a public origin',async()=>{
  if(kotlin){
    // The Kotlin server refuses to start with such settings; the refusal is in its output.
    await assert.rejects(startApp({origin,devLogin:true,environment:'production'}),/never available in production/);
    await assert.rejects(startApp({origin:'https://sprintique.example',devLogin:true}),/loopback/);
    return;
  }
  const previous=process.env['NODE_ENV'];
  try{process.env['NODE_ENV']='production';await assert.rejects(createApp({db:f.db,origin,devLogin:true}),/never available in production/);}
  finally{if(previous===undefined)delete process.env['NODE_ENV'];else process.env['NODE_ENV']=previous;}
  await assert.rejects(createApp({db:f.db,origin:'https://sprintique.example',devLogin:true}),/loopback/);
});
test('D03 only admin/admin from the app origin opens a real server session',async()=>{
  assert.equal((await login({username:'admin',password:'wrong'})).statusCode,401);
  assert.equal((await login({username:'root',password:'admin'})).statusCode,401);
  assert.equal((await login({username:'admin',password:'admin'},{origin:'https://evil.example'})).statusCode,403);
  assert.equal((await login({username:'admin',password:'admin',extra:true})).statusCode,400);
  const ok=await login({username:'admin',password:'admin'});assert.equal(ok.statusCode,200,ok.body);
  const cookie=String(ok.headers['set-cookie']);assert.match(cookie,/^__Host-sprintique=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  const session=await f.app.inject({method:'GET',url:'/api/v1/session',headers:{cookie:cookie.split(';')[0]!}});
  assert.equal(session.statusCode,200,session.body);assert.equal(session.json().principal.name,'Администратор');
});
test('D04 mock data gives the dev admin several workspaces with boards, releases and members',async()=>{
  const {summary}=await seedDevData(f.app,f.admin,origin);assert.ok(summary.length>=5);
  const cookie=String((await login({username:'admin',password:'admin'})).headers['set-cookie']).split(';')[0]!;
  const projects=(await f.app.inject({method:'GET',url:'/api/v1/session',headers:{cookie}})).json().projects as {id:string;key:string;workspaceName:string}[];
  assert.ok(new Set(projects.map(p=>p.workspaceName)).size>=3);
  const spq=projects.find(p=>p.key==='SPQ')!;
  const board=(await f.app.inject({method:'GET',url:`/api/v1/projects/${spq.id}/board/tasks?limit=100`,headers:{cookie}})).json();
  assert.ok(board.total>=8,JSON.stringify(board).slice(0,200));
  const members=(await f.app.inject({method:'GET',url:`/api/v1/projects/${spq.id}/members`,headers:{cookie}})).json() as unknown[];
  assert.ok(members.length>=4);
});
