// The Kotlin backend behind the same `inject()` shape the tests used with Fastify: a real server process on a
// loopback port, requests over HTTP. Options that were createApp arguments become SPRINTIQUE_* settings.
import {appendFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// @ts-expect-error: plain ESM helper shared with the runner
import {startServer,startWorker} from '../../scripts/kotlin-server.mjs';

export interface InjectOptions {method?:string;url:string;headers?:Record<string,string|undefined>;payload?:unknown;query?:Record<string,string>}
export interface InjectResponse {statusCode:number;headers:Record<string,string|string[]|undefined>;body:string;rawPayload:Buffer;json<T=any>():T}
export interface TestApp {url:string;inject(options:InjectOptions|string):Promise<InjectResponse>;close():Promise<void>}
export interface AppOptions {origin?:string;devLogin?:boolean;web?:boolean|string;metricsToken?:string;storage?:boolean;databaseUrl?:string;
  environment?:string;trustProxy?:string;port?:number;
  /** Further SPRINTIQUE_* settings, for local stands. */
  settings?:Record<string,string>;
  /** Synthetic sign-in providers, trusted through `providerTrust` (the fake provider's certificate authority). */
  google?:{issuer:string;clientId:string;clientSecret:string};apple?:{issuer:string;clientId:string;teamId:string;keyId:string;privateKeyFile:string};
  providerTrust?:string;
  /** Directory the local mail drop writes sign-in letters into (see support/mailbox.ts). */
  mailDrop?:string}

export function storageSettings():Record<string,string>{
  const file=process.env['TEST_S3_CONFIG']||'output/infra/storage.json';
  let config:Record<string,string>;
  try{config=JSON.parse(readFileSync(file,'utf8'));}catch{return {};}
  return {SPRINTIQUE_STORAGE_ENDPOINT:config['endpoint']!,SPRINTIQUE_STORAGE_REGION:config['region']!,SPRINTIQUE_STORAGE_BUCKET:config['bucket']!,
    SPRINTIQUE_STORAGE_ACCESS_KEY_ID:config['accessKeyId']!,SPRINTIQUE_STORAGE_SECRET_ACCESS_KEY:config['secretAccessKey']!};
}

export async function startKotlinApp(options:AppOptions={}):Promise<TestApp>{
  const env:Record<string,string>={
    SPRINTIQUE_DATABASE_URL:options.databaseUrl??process.env['DATABASE_URL']!,
    SPRINTIQUE_PUBLIC_ORIGIN:options.origin??'http://localhost:4311',
    SPRINTIQUE_DEV_LOGIN:String(!!options.devLogin),
    SPRINTIQUE_ENVIRONMENT:options.environment??'test',
    ...(options.web?{SPRINTIQUE_WEB_ROOT:typeof options.web==='string'?options.web:resolve('dist')}:{}),
    ...(options.metricsToken?{SPRINTIQUE_METRICS_TOKEN:options.metricsToken}:{}),
    ...(options.trustProxy?{SPRINTIQUE_TRUST_PROXY:options.trustProxy}:{}),
    ...(options.storage?storageSettings():{}),
    ...options.settings,
    ...(options.google?{SPRINTIQUE_GOOGLE_ISSUER:options.google.issuer,SPRINTIQUE_GOOGLE_CLIENT_ID:options.google.clientId,SPRINTIQUE_GOOGLE_CLIENT_SECRET:options.google.clientSecret}:{}),
    ...(options.apple?{SPRINTIQUE_APPLE_ISSUER:options.apple.issuer,SPRINTIQUE_APPLE_CLIENT_ID:options.apple.clientId,SPRINTIQUE_APPLE_TEAM_ID:options.apple.teamId,
      SPRINTIQUE_APPLE_KEY_ID:options.apple.keyId,SPRINTIQUE_APPLE_PRIVATE_KEY_FILE:options.apple.privateKeyFile}:{}),
    ...(options.providerTrust?{SPRINTIQUE_PROVIDER_TRUST_FILE:options.providerTrust}:{}),
    ...(options.mailDrop?{SPRINTIQUE_MAIL_DROP:options.mailDrop,SPRINTIQUE_MAIL_FROM:'Sprintique <no-reply@sprintique.test>'}:{}),
  };
  const server=await startServer(env,options.port?{port:options.port}:{});
  return {
    url:server.url,
    async inject(input){
      const options=typeof input==='string'?{url:input}:input;
      const method=(options.method??'GET').toUpperCase();
      const headers:Record<string,string>={};
      for(const [name,value] of Object.entries(options.headers??{}))if(value!==undefined)headers[name.toLowerCase()]=String(value);
      let body:BodyInit|undefined;
      if(options.payload!==undefined){
        if(Buffer.isBuffer(options.payload)||options.payload instanceof Uint8Array)body=new Blob([options.payload as Uint8Array<ArrayBuffer>]);
        else if(typeof options.payload==='string')body=options.payload;
        else{body=JSON.stringify(options.payload);headers['content-type']??='application/json';}
      }
      const target=new URL(options.url,server.url);
      for(const [name,value] of Object.entries(options.query??{}))target.searchParams.set(name,value);
      const response=await fetch(target,{method,headers,...(body!==undefined?{body}:{}),redirect:'manual'});
      const raw=Buffer.from(await response.arrayBuffer());
      const collected:Record<string,string|string[]>={};
      response.headers.forEach((value,name)=>{if(name!=='set-cookie')collected[name]=value;});
      const cookies=response.headers.getSetCookie();
      if(cookies.length)collected['set-cookie']=cookies.length===1?cookies[0]!:cookies;
      const text=raw.toString('utf8');
      return {statusCode:response.status,headers:collected,body:text,rawPayload:raw,json:<T>()=>JSON.parse(text) as T};
    },
    async close(){
      await server.stop();
      // SPRINTIQUE_TEST_SERVER_LOG=<file> keeps the server's own output of every run, for diagnosing a failed test.
      const log=process.env['SPRINTIQUE_TEST_SERVER_LOG'];
      if(log)appendFileSync(log,`\n=== ${server.url}\n${server.output()}`);
    },
  };
}

/** The `worker` command of the same artifact, on the worker role, with the test object storage. */
export async function startKotlinWorker():Promise<{stop():Promise<void>;output():string}>{
  return startWorker({SPRINTIQUE_WORKER_DATABASE_URL:process.env['WORKER_DATABASE_URL']!,...storageSettings()});
}
