import {taskKey} from '../ui/src/board/task-route.js';
import {parseMapRoute,mapRouteHash} from './maps-route.js';

/** Owns the existing task drawer while Maps remains mounted. Map saving is a guard for leaving the section. */
export function createMapsTaskContext({root,maps,repository,project,openDialog,canEdit,canManage}){
  let destroyed=false,modal=null,opening=null,generation=0,closing=null,closeReason=null,opener=null,section='task',entry=null;
  const mapHash=()=>mapRouteHash(maps.current?.id);
  const routeHash=()=>modal?mapRouteHash(maps.current?.id,modal.taskController.taskKey,section):mapHash();
  const cancelOpening=()=>{generation++;opening?.abort();opening=null;};
  const writeRoute=hash=>history.replaceState(history.state,'',hash);
  function focusMap(){
    if(destroyed||!root.isConnected)return;
    const target=opener?.isConnected&&root.contains(opener)?opener:root.querySelector('[data-open-linked-task], [data-map-action="maps"], [data-map-action="new"]');
    target?.focus({preventScroll:true});
  }
  function returnToMap(){
    // Only a drawer pushed by this host has a known map immediately behind it. Direct/reloaded links also work.
    if(entry&&history.state?.sprintiqueMapTask?.origin===entry.origin)history.back();
    else writeRoute(mapHash());
  }
  function restoreRefusedRoute(attempted){
    // Back can be refused by a draft. Restore the existing history entry, preserving the forward/back pair.
    if(entry&&attempted===mapHash()&&history.state?.sprintiqueMapOrigin===entry.origin)history.forward();
    else writeRoute(routeHash());
  }
  async function closeCurrent(reason,{keepOpen=false}={}){
    if(closing){
      if(!await closing)return false;
      // A section leave can arrive while a replacement merely settles the draft. It must still close that drawer.
      return keepOpen||!modal?true:closeCurrent(reason);
    }
    if(!modal)return true;
    const opened=modal;closeReason=keepOpen?null:reason;
    closing=(async()=>{
      const accepted=await opened.taskController.close({keepOpen});
      if(accepted&&!keepOpen&&opened.isConnected)await new Promise(resolve=>opened.addEventListener('iq-close',resolve,{once:true}));
      return accepted;
    })();
    try{return await closing;}finally{closing=null;closeReason=null;}
  }
  async function openTask(id,{fromRoute=false,section:nextSection='task',reload=false}={}){
    if(destroyed||!maps.current)return false;
    const hadTask=!!modal||!!parseMapRoute(location.hash)?.taskKey,origin=maps.current.id;
    cancelOpening();const intent=generation;
    if(!reload&&modal&&(modal.taskController.taskId===id||modal.taskController.taskKey===id)){
      section=modal.taskController.setSection?.(nextSection)||nextSection;writeRoute(routeHash());return modal;
    }
    if(!hadTask)opener=document.activeElement;
    const request=new AbortController();opening=request;
    const active=()=>!destroyed&&!request.signal.aborted&&generation===intent&&maps.current?.id===origin;
    try{
      const task=await repository.read('tasks',id,project.id,{signal:request.signal});
      if(!active())return false;if(!task||task.projectId!==project.id)throw Error('Задача недоступна в этом проекте. Текущий контекст остаётся открытым.');
      const handoff=modal;
      let created;created=await openDialog(task,{repository,project,tasks:[],attachmentAdapter:repository.attachmentAdapter,canEdit,canManage,
        signal:request.signal,isActive:active,initialSection:nextSection,replace:handoff,fullscreen:handoff?.dataset?.fullscreen==='true',
        beforeOpen:handoff?async()=>{
          if(!active()||modal!==handoff)return false;
          const accepted=await closeCurrent('switch-task',{keepOpen:true});
          if(!active()||modal!==handoff)return false;
          if(!accepted){restoreRefusedRoute(location.hash);return false;}
          // No loading remains: the prepared drawer replaces the old one synchronously after this callback.
          closeReason='switch-task';return true;
        }:null,
        onSectionChange:value=>{if(!destroyed&&modal===created){section=value;writeRoute(routeHash());}},
        onOpenTask:next=>openTask(next),onReload:()=>openTask(task.id,{reload:true,section}),
      });
      if(!created)return false;
      if(!active()){created.close(true);return false;}
      modal=created;section=created.taskController.setSection?.(nextSection)||nextSection;
      const hash=mapRouteHash(origin,taskKey(task),section);
      if(!fromRoute&&!hadTask){
        const originKey=crypto.randomUUID();
        history.replaceState({...history.state,sprintiqueMapOrigin:originKey},'',mapHash());
        entry={origin:originKey,mapId:origin};
        history.pushState({...history.state,sprintiqueMapTask:entry},'',hash);
      }else{
        entry=history.state?.sprintiqueMapTask?.mapId===origin?history.state.sprintiqueMapTask:null;
        writeRoute(hash);
      }
      const opened=created;
      opened.addEventListener('iq-close',()=>{
        if(modal!==opened)return;modal=null;
        if(!destroyed&&!closeReason){cancelOpening();returnToMap();focusMap();}
      },{once:true});
      return created;
    }catch(error){
      if(!active())return false;
      writeRoute(routeHash());if(!modal)focusMap();maps.message?.(error.message,true);throw error;
    }finally{if(opening===request)opening=null;if(closeReason==='switch-task')closeReason=null;}
  }
  async function openRoute(hash){
    const route=parseMapRoute(hash);if(!route||destroyed)return false;
    const previous=routeHash();
    // A route owns both reads. Returning to the already visible map also cancels a different map still loading.
    cancelOpening();const intent=generation,request=new AbortController();opening=request;
    const active=()=>!destroyed&&!request.signal.aborted&&generation===intent;
    try{
      if(route.mapId&&route.mapId!==maps.current?.id){
        const accepted=await closeCurrent('route');if(!active())return false;
        if(!accepted){restoreRefusedRoute(hash);return false;}
        const opened=await maps.openMap(route.mapId,{signal:request.signal});if(!active())return false;
        if(!opened){writeRoute(routeHash());return false;}
      }
      if(route.taskKey)return openTask(route.taskKey,{fromRoute:true,section:route.section});
      const accepted=await closeCurrent('route');if(!active())return false;
      if(!accepted){restoreRefusedRoute(hash);return false;}
      writeRoute(mapHash());if(previous!==mapHash())focusMap();return true;
    }catch(error){if(!active())return false;writeRoute(routeHash());throw error;}
    finally{if(opening===request)opening=null;}
  }
  return {
    openTask,openRoute,get routeHash(){return routeHash();},currentTask:()=>modal?.taskController.taskKey||null,
    async closeTask(){
      cancelOpening();
      if(!await closeCurrent('leave')){writeRoute(routeHash());return false;}
      // A closed task is not resurrected when the map's own draft refuses the next section.
      if(!await maps.readyToLeave()){writeRoute(mapHash());focusMap();return false;}return true;
    },
    destroy(){destroyed=true;cancelOpening();modal?.close(true);modal=null;return maps.destroy({force:true});},
  };
}
