// A fake SMTP relay on loopback for the notification letters: it speaks just enough SMTP for Jakarta Mail without TLS
// or authentication (SPRINTIQUE_SMTP_SECURITY=none is allowed to loopback only), keeps each letter as raw MIME, and can
// answer a recipient with a temporary (451) or a permanent (550) refusal. No letter ever leaves the machine.
import {createServer,type Server,type Socket} from 'node:net';

export interface Letter {from:string;to:string[];raw:string}
export interface FakeSmtp {port:number;letters:Letter[];refuse(address:string,code:451|550,times?:number):void;close():Promise<void>}

export async function startFakeSmtp():Promise<FakeSmtp>{
  const letters:Letter[]=[];const refusals=new Map<string,{code:number;times:number}>();
  const sockets=new Set<Socket>();
  const server:Server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
    socket.setEncoding('latin1');
    let buffer='',data=false,from='',to:string[]=[],body:string[]=[];
    const say=(line:string)=>socket.write(line+'\r\n');
    say('220 fake.smtp.test ESMTP');
    socket.on('data',(chunk:string)=>{
      buffer+=chunk;
      let end;
      while((end=buffer.indexOf('\r\n'))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data){
          if(line==='.'){
            data=false;letters.push({from,to,raw:Buffer.from(body.join('\r\n'),'latin1').toString('utf8')});body=[];say('250 2.0.0 queued');
          }else body.push(line.startsWith('..')?line.slice(1):line);
          continue;
        }
        const command=line.slice(0,4).toUpperCase();
        if(command==='EHLO'){socket.write('250-fake.smtp.test\r\n250 HELP\r\n');}
        else if(command==='HELO'||command==='NOOP'){say('250 OK');}
        else if(command==='RSET'){from='';to=[];say('250 OK');}
        else if(command==='MAIL'){from=line.replace(/^MAIL FROM:\s*<?([^>\s]*)>?.*$/i,'$1');to=[];say('250 OK');}
        else if(command==='RCPT'){
          const address=line.replace(/^RCPT TO:\s*<?([^>\s]*)>?.*$/i,'$1').toLowerCase();
          const refusal=refusals.get(address);
          if(refusal&&refusal.times>0){refusal.times--;say(refusal.code===451?'451 4.3.0 Try again later':'550 5.1.1 No such user');}
          else{to.push(address);say('250 OK');}
        }
        else if(command==='DATA'){if(!to.length){say('554 No valid recipients');}else{data=true;say('354 End data with <CR><LF>.<CR><LF>');}}
        else if(command==='QUIT'){say('221 Bye');socket.end();}
        else say('502 Command not implemented');
      }
    });
    socket.on('error',()=>{/* the client hung up */});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  return {port,letters,
    refuse(address,code,times=Number.MAX_SAFE_INTEGER){refusals.set(address.toLowerCase(),{code,times});},
    close:()=>new Promise<void>(resolve=>{for(const socket of sockets)socket.destroy();server.close(()=>resolve());})};
}

/** A parsed letter: decoded headers, and its parts by content type, decoded to text. */
export interface Parsed {headers:Map<string,string>;contentType:string;parts:{type:string;headers:Map<string,string>;text:string}[]}

function unfold(head:string):Map<string,string>{
  const headers=new Map<string,string>();
  for(const line of head.replace(/\r\n[ \t]+/g,' ').split('\r\n')){
    const at=line.indexOf(':');if(at>0)headers.set(line.slice(0,at).toLowerCase(),line.slice(at+1).trim());
  }
  return headers;
}

/** RFC 2047 encoded words (B and Q) as the subject carries them. */
export function decodeWords(value:string):string{
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g,(_,charset:string,encoding:string,text:string)=>{
    const bytes=encoding.toUpperCase()==='B'?Buffer.from(text,'base64')
      :Buffer.from(text.replace(/_/g,' ').replace(/=([0-9A-F]{2})/gi,(_m,hex:string)=>String.fromCharCode(parseInt(hex,16))),'latin1');
    return bytes.toString(charset.toLowerCase()==='utf-8'?'utf8':'latin1');
  });
}

function decodeBody(text:string,encoding:string|undefined):string{
  const kind=(encoding??'7bit').toLowerCase();
  if(kind==='base64')return Buffer.from(text.replace(/\s+/g,''),'base64').toString('utf8');
  if(kind==='quoted-printable'){
    const bytes=text.replace(/=\r\n/g,'').replace(/=([0-9A-F]{2})/gi,(_m,hex:string)=>String.fromCharCode(parseInt(hex,16)));
    return Buffer.from(bytes,'latin1').toString('utf8');
  }
  return text;
}

export function parseLetter(raw:string):Parsed{
  const split=raw.indexOf('\r\n\r\n');
  const headers=unfold(raw.slice(0,split)),body=raw.slice(split+4);
  const contentType=headers.get('content-type')??'text/plain';
  const boundary=/boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  const parts:Parsed['parts']=[];
  if(boundary){
    for(const chunk of body.split('--'+boundary).slice(1)){
      if(chunk.startsWith('--'))break;
      const content=chunk.replace(/^\r\n/,'');const at=content.indexOf('\r\n\r\n');
      const partHeaders=unfold(content.slice(0,at));
      parts.push({type:(partHeaders.get('content-type')??'text/plain').split(';')[0]!.trim(),headers:partHeaders,
        text:decodeBody(content.slice(at+4).replace(/\r\n$/,''),partHeaders.get('content-transfer-encoding'))});
    }
  }
  return {headers,contentType,parts};
}
