// A fake language model provider on a loopback port: it records every request (headers and JSON body) and answers
// with what the test's script says, in Anthropic's or OpenAI's format. Tests never call a real provider.
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

export interface Recorded {method:string;path:string;headers:Record<string,string|string[]|undefined>;body:any}
export interface Reply {status?:number;body?:unknown;headers?:Record<string,string>;delayMs?:number}
export type Script=(request:Recorded,calls:number)=>Reply|Promise<Reply>;

export async function fakeProvider(){
  const requests:Recorded[]=[];
  const scripts=new Map<string,Script>(),counts=new Map<string,number>();
  let fallback:Script=()=>({status:404,body:{error:{message:'no script'}}});
  const server=createServer((req,res)=>{
    const chunks:Buffer[]=[];
    req.on('data',chunk=>chunks.push(chunk));
    req.on('end',()=>void(async()=>{
      const text=Buffer.concat(chunks).toString('utf8');
      const recorded:Recorded={method:req.method||'GET',path:req.url||'/',headers:req.headers,body:text?JSON.parse(text):null};
      requests.push(recorded);
      // A script per model name: each agent of a test uses a model of its own.
      const key=recorded.body?.model??recorded.path,script=scripts.get(key)??fallback,n=(counts.get(key)??0)+1;counts.set(key,n);
      const reply=await script(recorded,n);
      if(reply.delayMs)await new Promise(resolve=>setTimeout(resolve,reply.delayMs));
      if(res.destroyed)return;
      res.writeHead(reply.status??200,{'content-type':'application/json',...reply.headers});
      res.end(reply.body===undefined?'':JSON.stringify(reply.body));
    })());
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address() as AddressInfo;
  return {
    url:`http://127.0.0.1:${port}`,requests,
    script(key:string,script:Script){scripts.set(key,script);counts.delete(key);},
    otherwise(script:Script){fallback=script;},
    for:(model:string)=>requests.filter(r=>r.body?.model===model),
    close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}),
  };
}

let sequence=0;
const usage={input_tokens:11,output_tokens:7};
/** Anthropic Messages API answers. */
export const anthropic={
  text:(text:string):Reply=>({body:{id:'msg_'+(++sequence),type:'message',role:'assistant',content:[{type:'text',text}],stop_reason:'end_turn',usage}}),
  tool:(name:string,input:unknown,text=''):Reply=>({body:{id:'msg_'+(++sequence),type:'message',role:'assistant',
    content:[...(text?[{type:'text',text}]:[]),{type:'tool_use',id:'toolu_'+(++sequence),name,input}],stop_reason:'tool_use',usage}}),
  /** The content of the last tool result the model received, parsed. */
  lastResult(request:Recorded):any{
    const blocks=request.body.messages.at(-1).content;const result=Array.isArray(blocks)?blocks.findLast((b:any)=>b.type==='tool_result'):null;
    return result?JSON.parse(result.content):null;
  },
};
/** OpenAI Chat Completions answers (and every compatible server's). */
export const openai={
  text:(content:string,cost?:number):Reply=>({body:{id:'chatcmpl-'+(++sequence),object:'chat.completion',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],
    usage:{prompt_tokens:20,completion_tokens:9,...(cost===undefined?{}:{cost})}}}),
  tool:(name:string,args:unknown,cost?:number):Reply=>({body:{id:'chatcmpl-'+(++sequence),object:'chat.completion',
    choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'call_'+(++sequence),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],
    usage:{prompt_tokens:20,completion_tokens:9,...(cost===undefined?{}:{cost})}}}),
  lastResult(request:Recorded):any{const message=request.body.messages.findLast((m:any)=>m.role==='tool');return message?JSON.parse(message.content):null;},
};
