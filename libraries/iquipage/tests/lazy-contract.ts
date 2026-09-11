import {registerCore,IqWorkHeader,version} from '../types/core.js';
import type {GraphPermissions,GraphPointer,GraphData} from '../types/extensions.js';
registerCore();void version;const heading: IqWorkHeader=document.createElement('iq-work-header');heading.setAttribute('title','План');
async function feature(){const api=await import('../types/extensions.js');api.registerAdvanced();const g=new api.IqGraph();
 const p:GraphPermissions={read:true,editContent:false,move:true,resize:true,connect:false,fields:{title:false}};g.permissions=p;g.nodePermissions={n:{read:false,move:true}};g.allowedKinds=['task','media'];g.kindLabels={task:'Статус'};
 const d:GraphData={nodes:[{id:'n',title:'Неизменяемая задача',kind:'task',readonly:true,applicationId:42}],edges:[]};g.data=d;g.mediaSources=new Map([['photo',new Blob([''],{type:'image/png'})]]);g.archiveClusters=[{id:'arch',title:'Архив',nodeIds:['n']}];
 g.addEventListener('iq-pointer',e=>{const pointer=(e as CustomEvent<GraphPointer>).detail;void pointer.x;});
 const rm=new api.IqRoadmap();rm.dependencyCapabilities={create:false,update:true,delete:false};rm.data={rows:[{id:'a',kind:'task',title:'Работа'},{id:'b',kind:'task',title:'Подзадача',parentId:'a'}]};
 const crop=new api.IqImageCrop();crop.content={title:'Обложка проекта'};
 // @ts-expect-error unsupported graph kind
 g.allowedKinds=['drawing'];
 // @ts-expect-error operation permissions are booleans
 g.permissions={move:'yes'};
}
void feature;
async function board(){const w=await import('../types/whiteboard.js');w.registerWhiteboard();const b=new w.IqWhiteboard();b.data={title:'Проверка',revision:1,objects:[{id:'n',type:'shape',shape:'diamond',text:'Решение',x:0,y:0,width:280,height:220,color:'neutral',align:'center',valign:'middle'}],connections:[]};}
void board;
