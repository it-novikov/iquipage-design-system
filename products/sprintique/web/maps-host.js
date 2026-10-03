import {mountMaps} from '../ui/src/maps.js';
import {can} from './permissions.js';

export async function mountMapsHost(root,{repository,project,onOpenTasks,viewState={}}){
  const match=location.hash.match(/^#maps\/([A-Za-z0-9_-]+)$/);
  // Objects are edited in the right-hand properties panel; the library stays open on the left. The map last open in
  // this section is read alongside the list: it is usually the one the list opens again.
  const maps=await mountMaps(root,{repository,project,mapId:match?.[1],likelyMapId:match?.[1]||viewState.mapId,canvasEditing:'properties',
    context:{actorId:repository.context.actorId,workspaceId:project.workspaceId},
    permissions:{read:true,edit:can(project,'maps.write')},
    uiCapabilities:{workflow:false,automation:false,agentProposals:false,allowedCreateTypes:['sticky','text','task','shape','frame',...(repository.capabilities.attachments?['image']:[])]},
    onOpenMap:({id})=>{viewState.mapId=id;history.replaceState(null,'','#maps/'+encodeURIComponent(id));},onOpenTasks});
  return {closeTask:()=>maps.readyToLeave(),destroy:()=>maps.destroy({force:true})};
}
