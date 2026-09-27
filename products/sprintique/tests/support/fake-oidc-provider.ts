// A synthetic OpenID Connect provider for the Kotlin backend, which cannot take an in-process transport: HTTPS on
// loopback with a throwaway certificate authority that only the server under test is told to trust (through
// SPRINTIQUE_OIDC_TRUST_FILE). Nothing touches system or JVM-wide trust.
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Answers one provider request: the full URL and the raw request body; returns the JSON response. */
export type ProviderHandler=(url:string,body:string)=>unknown;
export interface FakeOidcProvider {issuer:string;trustFile:string;failures:unknown[];close():Promise<void>}

export async function startFakeOidcProvider(handler:(issuer:string)=>ProviderHandler):Promise<FakeOidcProvider>{
  const root=await mkdtemp(join(tmpdir(),'sprintique-oidc-'));
  const openssl=(...args:string[])=>execFileSync('openssl',args,{stdio:['ignore','pipe','pipe']});
  openssl('req','-x509','-newkey','rsa:2048','-sha256','-days','1','-nodes','-subj','/CN=Sprintique test CA','-keyout',join(root,'ca.key'),'-out',join(root,'ca.crt'));
  openssl('req','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',join(root,'localhost.key'),'-out',join(root,'localhost.csr'));
  await writeFile(join(root,'localhost.ext'),'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509','-req','-in',join(root,'localhost.csr'),'-CA',join(root,'ca.crt'),'-CAkey',join(root,'ca.key'),'-set_serial','1','-days','1','-sha256','-extfile',join(root,'localhost.ext'),'-out',join(root,'localhost.crt'));
  const failures:unknown[]=[];
  let respond:ProviderHandler=()=>{throw Error('provider not started');};
  const server=createServer({key:await readFile(join(root,'localhost.key')),cert:await readFile(join(root,'localhost.crt'))},(request,response)=>{
    const chunks:Buffer[]=[];
    request.on('data',chunk=>chunks.push(chunk));
    request.on('end',()=>{
      try{
        const body=JSON.stringify(respond(issuer+(request.url??'/'),Buffer.concat(chunks).toString('utf8')));
        response.writeHead(200,{'content-type':'application/json'}).end(body);
      }catch(error){failures.push(error);response.writeHead(500).end();}
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const issuer=`https://localhost:${(server.address() as AddressInfo).port}`;
  respond=handler(issuer);
  return {issuer,trustFile:join(root,'ca.crt'),failures,
    async close(){await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}};
}
