import {selectThreadPage} from './thread-page.js';

/** Keeps draft-bearing rows while refreshing a changed server snapshot. */
export function createThreadPager(repository,task,{pinned=()=>new Set(),onChange=()=>{},onError=()=>{}}={}){
  let items=new Map(),nextCursor=null,total=0,unresolved=0,sequence=0,request=null,closed=false,loading=false;
  const state=()=>({items:[...items.values()],nextCursor,total,unresolved,loading});
  const notify=()=>{if(!closed)onChange(state());};
  async function load(reset){
    if(closed||!reset&&(loading||!nextCursor))return;
    request?.abort();const token=++sequence;request=new AbortController();loading=true;notify();
    try{
      const options={limit:20,cursor:reset?null:nextCursor,signal:request.signal};
      const page=repository.pageThreads?await repository.pageThreads(task.projectId,task.id,options):
        await selectThreadPage(await repository.list('threads',task.projectId),task.projectId,task.id,options);
      if(closed||token!==sequence)return;
      if(reset){const keep=pinned();items=new Map([...items].filter(([id])=>keep.has(id)));}
      for(const thread of page.items)items.set(thread.id,thread);
      nextCursor=page.nextCursor;total=page.total;unresolved=page.unresolved;loading=false;notify();
    }catch(error){
      if(closed||token!==sequence||error.name==='AbortError')return;
      loading=false;
      if(!reset&&error.code==='THREAD_CURSOR_STALE'){await load(true);onError(error);return;}
      notify();onError(error);
    }
  }
  return {
    reload:()=>load(true),
    more:()=>load(false),
    remember(thread){items.set(thread.id,thread);},
    state,
    destroy(){closed=true;sequence++;request?.abort();items.clear();}
  };
}
