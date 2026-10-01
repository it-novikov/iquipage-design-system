// Who the @ list of a discussion offers and how mentions read (docs/decisions/0008-mentions-and-service-inbox.md).
// The people of the project first, then its service accounts with their owner, as in the owner picker (SPR-7). Only
// members that can read the task now are offered, which is also what the server notifies; a token naming anyone else
// shows as plain text.
import {accountName} from './assignees.js';

const reads=member=>!Array.isArray(member?.permissions)||member.permissions.includes('tasks.read');

/** The members the @ list offers: {id, name, kind, description?, image?}, people first. */
export function mentionCandidates(members,{image=()=>undefined}={}){
  const list=Array.isArray(members)?members:[];
  const people=list.filter(m=>(m.kind??'human')==='human'&&reads(m)).map(m=>({id:m.id,name:m.name,kind:'human',image:image(m)}));
  const accounts=list.filter(m=>m.kind==='service'&&!m.suspended&&reads(m)).map(m=>({
    id:m.id,name:accountName(m),kind:'service',description:`Владелец — ${m.ownerName||'не назначен'}`
  }));
  return [...people,...accounts].filter(m=>typeof m.id==='string'&&String(m.name||'').trim());
}

/** Every member by its own name, for mention pills: a service account reads as itself, not «… (сервисный аккаунт …)». */
export function mentionNames(members){
  return (Array.isArray(members)?members:[]).filter(m=>m&&(m.kind??'human')!=='agent')
    .map(m=>({id:m.id,name:m.kind==='service'?accountName(m):m.name,kind:m.kind==='service'?'service':'human'}))
    .filter(m=>typeof m.id==='string'&&String(m.name||'').trim());
}

/** A preview cut at 160 characters may end inside a token: that tail reads as «@Имя…», never as Markdown. */
export const closeCutMention=(text,cut=160)=>String(text??'').length<cut?String(text??''):String(text).replace(/(?<![\p{L}\p{N}_@.])@\[([^\[\]\\\n]*)(?:\](?:\([^)\n]*)?)?$/u,(_,label)=>'@'+label+'…');
