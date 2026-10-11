import {uid} from '../common.js';
export const MATERIAL_CATEGORIES=Object.freeze({design:'Дизайн',documentation:'Документация'});
export function materialValues(value){
 if(!Object.hasOwn(MATERIAL_CATEGORIES,value.category))throw Error('Выберите раздел материала.');
 const title=String(value.title||'').trim(),raw=String(value.url||'').trim();
 if(!title||title.length>200)throw Error('Введите название материала — до 200 знаков.');
 const parts=raw.match(/^https?:\/\/([^/?#]+)([^?#]*)/i),authority=parts?.[1]||'',path=parts?.[2]||'';
 let url;try{url=new URL(raw);}catch{throw Error('Введите ссылку с http:// или https://.');}
 const host=url.hostname,dnsValid=host.startsWith('[')||host.replace(/\.$/,'').split('.').every(label=>label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
 if(!authority||/[@%]/.test(authority)||!dnsValid||/[\[\]]/.test(path)||raw.includes('\\')||!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\s\u0000-\u001f\u007f-\u009f<>"{}|^`]/u.test(raw)||/%(?![a-f0-9]{2})/i.test(raw)||raw.length>2048||new TextEncoder().encode(raw).length>2048)throw Error('Введите корректную ссылку с http:// или https:// без пробелов и данных входа.');
 return {category:value.category,title,url:raw};
}
export function sameMaterial(a,b){return a.category===b.category&&a.title===b.title&&a.url===b.url;}
/** Stable ids survive retries. A lost answer never authorizes overwriting a different saved value. */
export function createMaterialDrafts(){
 const rows=[];
 return {items:()=>rows,adopt(value){const i=rows.findIndex(x=>x.id===value.id);if(value.archivedAt){if(i>=0)rows.splice(i,1);}else if(i>=0)Object.assign(rows[i],value,{state:'saved',error:''});else rows.push({...value,state:'saved',error:''});},sync(values){for(let i=rows.length-1;i>=0;i--)if(rows[i].state==='saved'&&!values.some(x=>x.id===rows[i].id))rows.splice(i,1);for(const value of values){const old=rows.find(x=>x.id===value.id);if(!old||old.state==='saved')this.adopt(value);}},unsaved:()=>rows.filter(x=>x.state!=='saved'),failed:()=>rows.filter(x=>x.state==='failed'),
  add(value){if(rows.length>=100)throw Error('В задаче уже 100 материалов.');const fields=materialValues(value);if(rows.some(x=>x.category===fields.category&&x.url===fields.url))throw Error('Эта ссылка уже добавлена.');const row={id:uid('material'),...fields,revision:0,state:'pending',error:''};rows.push(row);return row;},
  update(id,value){const row=rows.find(x=>x.id===id);if(!row||row.state==='saving'||row.state==='saved')throw Error('Материал уже сохраняется или сохранён.');const fields=materialValues(value);if(rows.some(x=>x.id!==id&&x.category===fields.category&&x.url===fields.url))throw Error('Эта ссылка уже добавлена.');Object.assign(row,fields,{state:'pending',error:''});return row;},
  remove(id){const i=rows.findIndex(x=>x.id===id&&x.state!=='saving'&&x.state!=='saved');if(i<0)return false;rows.splice(i,1);return true;}
 };
}
export async function saveMaterialDrafts(repository,drafts,{taskId,projectId,onChange=()=>{},signal}){
 for(const row of drafts.unsaved()){
  signal?.throwIfAborted();
  if(row.state==='saving')continue;
  row.state='saving';row.error='';row.conflict=null;onChange();
  try{const saved=await repository.putTaskMaterial(taskId,{id:row.id,...materialValues(row),archived:false},0,{projectId,signal});Object.assign(row,saved,{state:'saved',error:''});}
  catch(error){
   let saved=null;if(error?.code==='CONFLICT'){const current=await repository.readTaskMaterial(taskId,row.id,projectId,{signal}).catch(()=>null);if(current&&!current.archivedAt&&sameMaterial(current,row))saved=current;else if(current)row.conflict=current;}
   if(saved)Object.assign(row,saved,{state:'saved',error:''});else Object.assign(row,{state:'failed',error:row.conflict?'Материал уже изменён. Откройте «Изменить», чтобы сравнить версии.':error?.message||'Не удалось сохранить ссылку.'});
  }
  onChange();
 }
 return drafts.unsaved().length;
}
