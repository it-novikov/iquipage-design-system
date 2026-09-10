import {clone,uid,requireValue,assertSafeJSON,validText} from './common.js';
import {validateDocument,extractSelection} from './document.js';
/** Deliberately excludes image bytes, credentials, run payloads and private host state. */
export function agentContext(map,{ids=null,limit=100}={}) {
  const document=ids?.length?extractSelection(map.document,ids):map.document;
  requireValue(document.objects.length<=limit,'CONTEXT_LIMIT','Выберите не более 100 объектов для агента.');
  return {schema:'iquipage.agent-context/1',mapId:map.id,projectId:map.projectId,baseRevision:map.revision,title:map.title,objects:document.objects.map(o=>({id:o.id,type:o.type,text:o.text,parentId:o.parentId||null,locked:!!o.locked})),connections:document.connections.map(e=>({id:e.id,from:e.from,to:e.to,label:e.label||''}))};
}
export function proposalDocument(map,proposal,{canEdit=false}={}) {
  requireValue(canEdit&&map.status!=='archived','READ_ONLY','Изменение карты недоступно.');assertSafeJSON(proposal);
  requireValue(proposal.schema==='iquipage.map-proposal/1'&&proposal.mapId===map.id&&proposal.projectId===map.projectId,'PROPOSAL_SCOPE','Предложение относится к другой карте.');
  requireValue(proposal.baseRevision===map.revision,'CONFLICT','Карта уже изменилась. Агент должен обновить предложение.');
  requireValue(Array.isArray(proposal.operations)&&proposal.operations.length>0&&proposal.operations.length<=100,'PROPOSAL_LIMIT','Нужно от 1 до 100 изменений.');
  const next=clone(map.document),changes=[];
  for(const op of proposal.operations){
    requireValue(validText(op.text)&&op.text.trim(),'PROPOSAL_TEXT','Нужен текст не длиннее 10 000 символов.');
    if(op.type==='updateText'){
      const node=next.objects.find(o=>o.id===op.id);requireValue(node,'PROPOSAL_TARGET','Объект не найден.');
      requireValue(!node.externalTaskId,'EXTERNAL_TASK','Содержимое внешней задачи изменяется в разделе задач.');
      let ancestor=node;const seen=new Set();
      while(ancestor){requireValue(!ancestor.locked,'LOCKED','Агент не может изменить заблокированный объект.');if(seen.has(ancestor.id))break;seen.add(ancestor.id);ancestor=next.objects.find(o=>o.id===ancestor.parentId);}
      changes.push({id:node.id,before:node.text,after:op.text});node.text=op.text;
    }else if(op.type==='addSticky'){
      const index=changes.length,node={id:uid('idea'),type:'sticky',text:op.text,x:60+(index%3)*290,y:Math.max(0,...next.objects.map(o=>o.y+o.height))+60,width:252,height:148,color:'sky'};
      next.objects.push(node);changes.push({id:node.id,before:null,after:op.text});
    }else requireValue(false,'PROPOSAL_OPERATION','Допустимы только добавление заметки и изменение текста.');
  }
  return {document:validateDocument(next),changes};
}
