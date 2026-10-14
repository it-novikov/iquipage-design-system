// Real current product modules and CSS. Only bootstrap and read data are synthetic.
import '@iquipage/web/styles.css';
import '../../../ui/src/maps.css';
import '../../../ui/src/board/board.css';
import '../../../ui/shell.css';
import '../../../web/shell.css';
import '../../../ui/planning/src/planning.css';
import '../../../ui/finance/src/finance.css';
import '../../../ui/planning/src/navigation.css';
import '../../../web/workbench/workbench.css';
import {registerCore,version,ui} from '@iquipage/web/core';
import {openTaskDialog} from '../../../ui/src/board/task-dialog.js';
import {mountProjectNavigation} from '../../../ui/planning/src/project-navigation.js';
import {person,project,navigationContext,tasks,syntheticRepository} from '../tabs-geometry/repository.js';
import {scenario} from './data.mjs';

const data=scenario(new URLSearchParams(location.search).get('scenario'));
registerCore();
const fixture=syntheticRepository(),originalRequest=fixture.repository.client.request.bind(fixture.repository.client);
fixture.repository.client.request=async(path,method='GET',body,key,signal)=>{
  signal?.throwIfAborted();
  if(method==='GET'&&path===`/projects/${project.id}/tasks/${data.task.id}/work`){
    fixture.reads.push({operation:method,path,scenario:data.id});return structuredClone(data.work);
  }
  return originalRequest(path,method,body,key,signal);
};
const probe={ready:false,bootstrapError:null,openError:null,version,scenario:data.id,
  reads:fixture.reads,unsupported:fixture.unsupported,attempts:fixture.attempts};
window.taskOverviewProbe=probe;
let nav;
try{
  nav=mountProjectNavigation(document.querySelector('[data-product-nav]'),{
    current:navigationContext,profile:person,catalog:()=>[project],projects:async()=>({options:[{value:project.id,label:project.name}],nextCursor:null}),
    onSwitch:()=>{throw Error('Project switching is outside this fixture');},onAccount:()=>{},onTeam:()=>{},onSignOut:()=>{},
  });
  nav.setRoute('tasks');nav.setTheme('light');
  history.replaceState(null,'','#tasks');
  const root=document.querySelector('#host-view');root.innerHTML=ui.btn('Открыть задачу','secondary','','id="open-task"');
  root.querySelector('#open-task').addEventListener('click',async()=>{
    try{await openTaskDialog(data.task,{repository:fixture.repository,project,tasks,canEdit:true,canManage:false,initialSection:'task'});}
    catch(error){probe.openError=error.stack||error.message;}
  });
  await document.fonts.ready;probe.ready=true;
}catch(error){probe.bootstrapError=error.stack||error.message;}
window.addEventListener('pagehide',()=>nav?.destroy(),{once:true});
