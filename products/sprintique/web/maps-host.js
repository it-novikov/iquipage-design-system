import {mountMaps} from '../ui/src/maps.js';

export async function mountMapsHost(root,{repository,project,onOpenTasks}){
  const match=location.hash.match(/^#maps\/([A-Za-z0-9_-]+)$/);
  const maps=await mountMaps(root,{repository,project,mapId:match?.[1],
    context:{actorId:repository.context.actorId,workspaceId:project.workspaceId},
    permissions:{read:true,edit:project.role!=='reader'},
    uiCapabilities:{workflow:false,automation:false,agentProposals:false,allowedCreateTypes:['sticky','text','task','shape','frame',...(repository.capabilities.attachments?['image']:[])]},
    onOpenMap:({id})=>history.replaceState(null,'','#maps/'+encodeURIComponent(id)),onOpenTasks});
  return {closeTask:()=>maps.readyToLeave(),destroy:()=>maps.destroy({force:true})};
}
