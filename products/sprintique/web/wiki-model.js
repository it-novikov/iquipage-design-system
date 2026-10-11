const ID=/^[A-Za-z0-9_-]{1,100}$/;
export function wikiRoute(hash){
 const bits=String(hash).split('/');if(hash==='#wiki')return {kind:'index'};if(hash==='#wiki/archive')return {kind:'archive'};if(hash==='#wiki/new')return {kind:'new'};
 if(bits[0]!=='#wiki'||bits[1]!=='page'||!ID.test(bits[2]||''))return {kind:'invalid'};
 if(bits.length===3)return {kind:'page',id:bits[2]};if(bits[3]==='edit'&&bits.length===4)return {kind:'edit',id:bits[2]};
 if(bits[3]==='history'&&bits.length===4)return {kind:'history',id:bits[2]};if(bits[3]==='history'&&bits.length===5&&/^[1-9]\d*$/.test(bits[4])&&Number.isSafeInteger(Number(bits[4])))return {kind:'version',id:bits[2],version:Number(bits[4])};
 return {kind:'invalid'};
}
export const wikiHash=(id,mode='')=>'#wiki/page/'+encodeURIComponent(id)+(mode?'/'+mode:'');
export function wikiTree(rows){const active=rows.filter(p=>!p.archivedAt),ids=new Set(active.map(p=>p.id)),children=new Map();for(const p of active){const parent=ids.has(p.parentId)?p.parentId:null;const list=children.get(parent)||[];list.push(p);children.set(parent,list);}const build=(id,seen=new Set())=>(children.get(id)||[]).sort((a,b)=>a.title.localeCompare(b.title,'ru',{numeric:true})).filter(p=>!seen.has(p.id)).map(p=>({id:p.id,label:p.title,...(children.has(p.id)?{children:build(p.id,new Set([...seen,p.id]))}:{})}));return build(null);}
export function wikiAncestors(rows,id){const byId=new Map(rows.map(p=>[p.id,p])),found=[],seen=new Set([id]);let p=byId.get(id);while(p?.parentId&&!seen.has(p.parentId)){seen.add(p.parentId);found.unshift(p.parentId);p=byId.get(p.parentId);}return found;}
export function wikiParents(rows,id){return rows.filter(p=>!p.archivedAt&&p.id!==id&&!wikiAncestors(rows,p.id).includes(id)).sort((a,b)=>a.title.localeCompare(b.title,'ru',{numeric:true}));}
export const pageValue=page=>({title:page.title,body:page.body,parentId:page.parentId??null,archived:!!page.archivedAt});
export function wikiDraft(page={id:crypto.randomUUID(),title:'',body:'',parentId:null,revision:0}){
 const original=pageValue(page);let base=page.revision,checked=false,conflict=null;const value={...original};
 return {id:page.id,value,get revision(){return base;},get dirty(){return base===0||JSON.stringify(value)!==JSON.stringify(original);},get conflict(){return conflict;},get checked(){return checked;},setConflict(current){conflict=current;checked=false;},review({restore=false,parentId}={}){if(!conflict)return;if(conflict.archivedAt&&!restore)throw Error('Страница в архиве. Для сохранения явно подтвердите восстановление.');value.parentId=parentId===undefined?(conflict.parentId??null):parentId;value.archived=restore?false:!!conflict.archivedAt;checked=true;base=conflict.revision;},payload(){if(!value.title.trim())throw Error('Введите название страницы.');if(value.title.trim().length>200||value.body.length>100000)throw Error('Название — до 200 знаков, текст — до 100 000.');if(conflict&&!checked)throw Error('Сначала прочитайте актуальную версию страницы.');return {baseRevision:base,value:{...value,title:value.title.trim()}};}};
}
/** An aborted/superseded read cannot paint a different route or query. */
export function wikiReads(){const channels=new Map();let closed=false;return {start(name){channels.get(name)?.abort();const ctrl=new AbortController();channels.set(name,ctrl);return {signal:ctrl.signal,current:()=>!closed&&!ctrl.signal.aborted&&channels.get(name)===ctrl};},cancel(name){channels.get(name)?.abort();},close(){closed=true;for(const c of channels.values())c.abort();}};}

export function wikiExcerpt(value){return String(value||'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^[ \t]*#{1,6}[ \t]+/gm,'').replace(/[`*_~]/g,'').replace(/\s+/g,' ').trim();}

export function revealWikiVersion(list){const selected=list.querySelector('[data-selected=true]');if(!selected)return;const row=selected.getBoundingClientRect(),viewport=list.getBoundingClientRect();if(row.top<viewport.top)list.scrollTop-=viewport.top-row.top;else if(row.bottom>viewport.bottom)list.scrollTop+=row.bottom-viewport.bottom;}

export function wikiPathEntries(catalog,page,parentId=null){const rows=page?[...catalog.filter(p=>p.id!==page.id),page]:catalog,ids=page?wikiAncestors(rows,page.id):parentId?[...wikiAncestors(rows,parentId),parentId]:[];return ids.map(id=>({id,title:rows.find(p=>p.id===id)?.title||'Страница'}));}

/** Loading and hidden mobile rails must not overwrite a document context's position. */
export function wikiRailScroll(){
 const positions=new Map();let key=null,ready=false;
 const capture=list=>{if(ready&&list.clientHeight>0)positions.set(key,list.scrollTop);};
 const restore=list=>{if(ready&&list.clientHeight>0)list.scrollTop=positions.get(key)||0;};
 return {capture,restore,render(list,nextKey,contentReady,paint){capture(list);key=nextKey;ready=false;paint();ready=contentReady;restore(list);}};
}


/** A successful empty response differs from a catalog that has not arrived yet. */
export function wikiCatalogState(){
 let rows=null,error='',pending=false;
 return {get rows(){return rows;},get loaded(){return rows!==null;},get error(){return error;},get pending(){return pending;},
  async load(request,fetchRows,changed,formatError){
   pending=true;error='';changed();
   try{const result=await fetchRows(request.signal);if(request.current())rows=result;}
   catch(cause){if(request.current())error=formatError(cause);}
   finally{if(request.current()){pending=false;changed();}}
  }};
}
