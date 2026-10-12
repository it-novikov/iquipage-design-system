import {mountMaps} from '../ui/src/maps.js';
import {can} from './permissions.js';
import {parseMapRoute,mapRouteHash} from './maps-route.js';
import {createMapsTaskContext} from './maps-task-context.js';

export async function mountMapsHost(root,{repository,project,viewState={}}){
  const initialHash=location.hash,route=parseMapRoute(initialHash);let host;
  // Objects are edited in the right-hand properties panel; the library stays open on the left. The map last open in
  // this section is read alongside the list: it is usually the one the list opens again.
  const maps=await mountMaps(root,{repository,project,mapId:route?.mapId,likelyMapId:route?.mapId||viewState.mapId,canvasEditing:'properties',
    context:{actorId:repository.context.actorId,workspaceId:project.workspaceId},
    permissions:{read:true,edit:can(project,'maps.write')},
    uiCapabilities:{workflow:false,automation:false,agentProposals:false,allowedCreateTypes:['sticky','text','task','shape','frame',...(repository.capabilities.attachments?['image']:[])]},
    onOpenMap:({id})=>{viewState.mapId=id;
      // During the initial await, hashchange can arrive before the shell has this host. Preserve that newer intent.
      if(!host&&location.hash!==initialHash)return;
      const current=parseMapRoute(location.hash);history.replaceState(history.state,'',mapRouteHash(id,current?.mapId===id?current.taskKey:null,current?.section));},
    onOpenTasks:({focusTaskId})=>host?.openTask(focusTaskId).catch(error=>maps.message(error.message,true))});
  host=createMapsTaskContext({root,maps,repository,project,canEdit:can(project,'tasks.write'),canManage:can(project,'project.settings'),
    openDialog:async(...args)=>(await import('../ui/src/board/task-dialog.js')).openTaskDialog(...args)});
  const latestHash=location.hash,latest=parseMapRoute(latestHash);
  if(latest&&(maps.current||latestHash!==initialHash))try{await host.openRoute(latestHash);}catch(error){maps.message(error.message,true);}
  return host;
}
