// A fake Bot API on loopback: records every sendMessage and answers by chat through a test's own rule. No message
// ever reaches Telegram.
import {createServer,type Server} from 'node:http';

export interface SentMessage {chat:number;text:string;markup:any;path:string;count:number}
export type Answer={status:number;body:unknown};
export interface FakeTelegram {url:string;sent:SentMessage[];close():Promise<void>}

/** `answer(chat, count)` decides the reply to the count-th message to that chat; by default every message is accepted. */
export async function startFakeTelegram(answer:(chat:number,count:number)=>Answer|null=()=>null):Promise<FakeTelegram>{
  const sent:SentMessage[]=[];const seen=new Map<number,number>();
  const server:Server=createServer((request,response)=>{
    let body='';request.on('data',chunk=>{body+=chunk;});
    request.on('end',()=>{
      const input=JSON.parse(body),chat=Number(input.chat_id),count=(seen.get(chat)??0)+1;seen.set(chat,count);
      sent.push({chat,text:input.text,markup:input.reply_markup,path:request.url!,count});
      const reply=answer(chat,count)??{status:200,body:{ok:true,result:{message_id:count}}};
      response.writeHead(reply.status,{'content-type':'application/json'});response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  // The API keeps its connections alive: they are dropped so that closing never waits on them.
  return {url:`http://127.0.0.1:${port}`,sent,close:()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})};
}
