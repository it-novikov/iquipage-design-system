import {clone,uid,requireValue,validId,validText,assertSafeJSON} from './common.js';
import {blankDocument} from './document.js';
export const NODE_TYPES = {
  input: {label:'Входные данные',description:'Заметки карты или данные события.',input:'none',output:'notes',shape:'pill'},
  transform: {label:'Подготовка списка',description:'Разбить строки или убрать повторы без LLM.',input:'notes',output:'actions',shape:'predefined'},
  condition: {label:'Проверка условия',description:'Выбрать путь по явному правилу.',input:'json',output:'json',shape:'diamond'},
  llm: {label:'Обработка с LLM',description:'Получить структурированный список через подключение платформы.',input:'notes',output:'actions',shape:'predefined'},
  approval: {label:'Подтверждение человеком',description:'Проверить и отредактировать результат до записи.',input:'actions',output:'actions',shape:'manual'},
  task: {label:'Создание задач',description:'Записать подтверждённые действия через адаптер задач.',input:'actions',output:'result',shape:'document'},
  output: {label:'Результат',description:'Сохранить итог запуска и ссылки на созданные записи.',input:'json',output:'none',shape:'document'}
};
export function createNode(kind, title=NODE_TYPES[kind]?.label, x=100, y=100) {
  requireValue(NODE_TYPES[kind],'INVALID_NODE','Неизвестный тип шага.');
  return {id:uid('node'),kind,title,x,y,width:250,height:kind==='condition'?180:116,config:kind==='transform'?{operation:'unique'}:kind==='condition'?{rule:'has-items',value:''}:kind==='llm'?{prompt:'Составь конкретные следующие действия по заметкам. Верни массив actions с полем title.',connectionRef:''}:{}};
}
export function createMeetingFlow() {
  const nodes=[createNode('input','Собрать заметки',60,120),createNode('transform','Подготовить действия',390,120),createNode('approval','Проверить и подтвердить',720,120),createNode('task','Создать задачи',720,390),createNode('output','Сохранить результат',390,390)];
  return {schema:'iquipage.flow/1',version:1,nodes,edges:nodes.slice(1).map((n,i)=>({id:uid('link'),source:nodes[i].id,target:n.id,when:'always'})),annotations:blankDocument('Пояснения')};
}
/** Structured validation; labels and geometry never define runtime semantics. */
export function validateFlow(flow) {
  const issues=[],issue=(code,message,nodeId,edgeId)=>issues.push({code,message,...(nodeId?{nodeId}:{}),...(edgeId?{edgeId}:{})});
  if(!flow||flow.schema!=='iquipage.flow/1'||!Array.isArray(flow.nodes)||!Array.isArray(flow.edges))return[{code:'SCHEMA',message:'Не задан сценарий действий.'}];
  try{assertSafeJSON(flow);}catch(e){return[{code:e.code,message:e.message}];}
  if(flow.nodes.some(n=>!n||typeof n!=='object')||flow.edges.some(e=>!e||typeof e!=='object'))return[{code:'SCHEMA',message:'Шаги и связи должны быть объектами.'}];
  if(!flow.nodes.length||flow.nodes.length>100)issue('SIZE','Нужно от 1 до 100 шагов.');
  const nodes=new Map(),edgeIds=new Set();
  for(const node of flow.nodes){
    if(!validId(node.id)||nodes.has(node.id))issue('NODE_ID','Неуникальный идентификатор шага.',node.id);
    nodes.set(node.id,node);
    if(!NODE_TYPES[node.kind])issue('NODE_TYPE','Неподдерживаемый тип шага.',node.id);
    if(!validText(node.title,240)||!node.title.trim())issue('TITLE','У шага должно быть название.',node.id);
    if(node.kind==='transform'&&!['lines','unique'].includes(node.config?.operation))issue('CONFIG','Выберите способ подготовки списка.',node.id);
    if(node.kind==='condition'&&!['has-items','contains'].includes(node.config?.rule))issue('CONFIG','Задайте правило проверки.',node.id);
    if(node.kind==='condition'&&node.config?.rule==='contains'&&!(typeof node.config.value==='string'&&node.config.value.trim()))issue('CONFIG','Введите текст для проверки.',node.id);
    if(node.kind==='llm'&&!(typeof node.config?.prompt==='string'&&node.config.prompt.trim()))issue('CONFIG','Задайте инструкцию LLM.',node.id);
  }
  const inbound=new Map(flow.nodes.map(n=>[n.id,[]])),outbound=new Map(flow.nodes.map(n=>[n.id,[]]));
  for(const edge of flow.edges){
    if(!validId(edge.id)||edgeIds.has(edge.id))issue('EDGE_ID','Неуникальный идентификатор связи.',null,edge.id);edgeIds.add(edge.id);
    if(!nodes.has(edge.source)||!nodes.has(edge.target)||edge.source===edge.target){issue('EDGE','Связь ссылается на отсутствующий или тот же шаг.',null,edge.id);continue;}
    if(!['always','true','false'].includes(edge.when))issue('BRANCH','Выберите условие перехода.',null,edge.id);
    inbound.get(edge.target).push(edge);outbound.get(edge.source).push(edge);
    const from=NODE_TYPES[nodes.get(edge.source).kind],to=NODE_TYPES[nodes.get(edge.target).kind];
    if(from&&to&&from.output!==to.input&&from.output!=='json'&&to.input!=='json')issue('PORT_TYPE',`Несовместимые данные: ${from.output} → ${to.input}.`,null,edge.id);
  }
  const starts=flow.nodes.filter(n=>n.kind==='input');
  if(starts.length!==1)issue('START','Должен быть один шаг «Входные данные».');
  if(!flow.nodes.some(n=>n.kind==='output'))issue('OUTPUT','Добавьте шаг результата.');
  for(const n of flow.nodes){
    const ins=inbound.get(n.id)||[],outs=outbound.get(n.id)||[];
    if(n.kind==='input'&&ins.length)issue('INPUT_EDGE','На вход нельзя возвращаться стрелкой. Используйте новый запуск.',n.id);
    if(n.kind!=='input'&&!ins.length)issue('UNCONNECTED','Подключите вход этого шага.',n.id);
    if(n.kind==='output'){if(outs.length)issue('OUTPUT_EDGE','Результат завершает ветвь.',n.id);}
    else if(n.kind==='condition'){if(outs.length!==2||!outs.some(e=>e.when==='true')||!outs.some(e=>e.when==='false'))issue('CONDITION_EDGES','У проверки нужны две ветви: «Да» и «Нет».',n.id);}
    else if(outs.length!==1||outs[0]?.when!=='always')issue('SUCCESSOR','Нужен один безусловный переход к следующему шагу.',n.id);
  }
  const visiting=new Set(),visited=new Set();
  function visit(id){if(visiting.has(id)){issue('CYCLE','Цикл пока не исполняется. Настройте ожидание вне этого сценария.',id);return;}if(visited.has(id))return;visiting.add(id);for(const e of outbound.get(id)||[])visit(e.target);visiting.delete(id);visited.add(id);}
  for(const n of flow.nodes)visit(n.id);
  if(starts.length===1){const reachable=new Set();const walk=id=>{if(reachable.has(id))return;reachable.add(id);for(const e of outbound.get(id)||[])walk(e.target);};walk(starts[0].id);for(const n of flow.nodes)if(!reachable.has(n.id))issue('UNREACHABLE','Шаг недоступен от входа.',n.id);}
  if(!issues.some(x=>x.code==='CYCLE')){
    const approvedBefore=(id,seen=new Set())=>{
      if(seen.has(id))return false;const node=nodes.get(id);if(node?.kind==='approval')return true;
      if(node?.kind==='input')return false;const parents=inbound.get(id)||[];
      return parents.length>0&&parents.every(e=>approvedBefore(e.source,new Set([...seen,id])));
    };
    for(const node of flow.nodes)if(node.kind==='task'&&!approvedBefore(node.id))issue('APPROVAL_REQUIRED','Перед созданием задач нужен шаг подтверждения на каждом пути.',node.id);
  }
  return issues;
}
export function flowScene(flow,title,revision=0){
  const notes=flow.annotations||blankDocument(title);
  return {...clone(notes),title,revision,objects:[...clone(notes.objects),...flow.nodes.map(n=>({id:n.id,type:'shape',shape:NODE_TYPES[n.kind]?.shape||'rectangle',text:n.title,x:n.x,y:n.y,width:n.width||250,height:n.height||116,color:'neutral',autoHeight:true}))],connections:[...clone(notes.connections),...flow.edges.map(e=>({id:e.id,from:e.source,to:e.target,style:'elbow',arrow:true,label:e.when==='true'?'Да':e.when==='false'?'Нет':'',color:e.when==='true'?'success':e.when==='false'?'warning':'neutral'}))]};
}
export function flowFromScene(previous,scene){
  const next=clone(previous),known=new Set(previous.nodes.map(n=>n.id)),objects=new Map(scene.objects.map(o=>[o.id,o]));
  next.nodes=next.nodes.filter(n=>objects.has(n.id)).map(n=>{const o=objects.get(n.id);return{...n,title:o.text,x:o.x,y:o.y,width:o.width,height:o.height};});
  const active=new Set(next.nodes.map(n=>n.id)),edges=new Map(previous.edges.map(e=>[e.id,e]));
  next.edges=scene.connections.filter(e=>active.has(e.from)&&active.has(e.to)).map(e=>({id:e.id,source:e.from,target:e.to,when:edges.get(e.id)?.when||'always'}));
  next.annotations={...blankDocument('Пояснения'),objects:scene.objects.filter(o=>!known.has(o.id)),connections:scene.connections.filter(e=>!active.has(e.from)&&!active.has(e.to))};
  next.version=(previous.version||0)+1;return next;
}
