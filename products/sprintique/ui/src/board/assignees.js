// Task owners (SPR-7): the people of a project and the service accounts that may take its tasks, so work can be handed
// to an agent. A service account reads «Имя (сервисный аккаунт)» wherever it owns a task; one that can no longer act
// keeps its tasks and says why until someone reassigns them. The server decides who may be assigned; these helpers
// only choose what the pickers offer and how owners read.

/** The heading of the service accounts in an owner picker: shown, never chosen. */
export const SERVICE_HEADING='__service_accounts__';
const STATE_WORDS={suspended:'приостановлен',deleted:'удалён',former:'не в проекте'};
const STATE_HINTS={
  suspended:'Аккаунт приостановлен и не работает над задачей.',
  deleted:'Аккаунт удалён.',
  former:'Аккаунт больше не участвует в проекте.'
};
const EDITING=['editor','admin'];

/** The member's own name: the repository adds the owner to a service account's name for discussions. */
export const accountName=member=>member?.accountName??member?.name??'';

/** How a task owner reads: a service account is marked as one, and so is one that can no longer act. */
export function assigneeLabel({name,kind,state}){
  if(kind!=='service')return name;
  return STATE_WORDS[state]?`${name} (сервисный аккаунт, ${STATE_WORDS[state]})`:`${name} (сервисный аккаунт)`;
}

/**
 * The name an avatar disc takes its initials from: a label without its trailing remark, so «Робот (сервисный аккаунт)»
 * reads «Р», not «Р(». The label itself stays the visible and spoken name.
 */
export const avatarName=label=>String(label||'').replace(/\s*\([^()]*\)$/,'')||String(label||'');

/** A member's state as an owner: the members list marks a service account that cannot act now as suspended. */
export const memberState=member=>member?.kind==='service'&&member.suspended?'suspended':'active';

// Whether a member edits tasks: the permission when the members list carries permissions, else the role.
const edits=member=>Array.isArray(member?.permissions)?member.permissions.includes('tasks.write'):EDITING.includes(member?.role);

/**
 * Whether a member may be given a task now: any person of the project; a service account that is active and edits
 * tasks, while its owner edits them in this project too (its rights never exceed its owner's).
 */
export function assignable(member,members=[]){
  const kind=member?.kind??'human';
  if(kind==='human')return true;
  if(kind!=='service'||member.suspended||!edits(member))return false;
  return edits(members.find(m=>m.id===member.ownerId));
}

/** A task's owner as the board and dialogs show it, from the task itself or from the members of the project. */
export function describeOwner(task,people=new Map()){
  if(!task.ownerId)return {owner:task.legacyOwner||'',ownerKind:null,ownerState:null};
  const member=people.get(task.ownerId);
  const kind=task.ownerKind??member?.kind??null,state=task.ownerState??(member?memberState(member):'former');
  const name=task.ownerName||accountName(member);
  // A former person stays anonymous as before; a service account is always named, with why it cannot act.
  const owner=kind==='service'&&name?assigneeLabel({name,kind,state}):task.ownerName||(member?name:'Бывший участник');
  return {owner,ownerKind:kind,ownerState:state};
}

/** Why the task's owner cannot act on it, or '' when it can (or is a person, as before). */
export function ownerWarning(task){
  if(task?.ownerKind!=='service'||!STATE_HINTS[task.ownerState])return '';
  return `${STATE_HINTS[task.ownerState]} Назначьте другого исполнителя или снимите назначение.`;
}

/**
 * The options of an owner picker: nobody, the people, then the service accounts that may take tasks under the heading
 * «Сервисные аккаунты», each with its owner. The current owner stays visible even when it may no longer be chosen.
 */
export function ownerOptions(members,current={},{image=()=>undefined}={}){
  const people=members.filter(m=>(m.kind??'human')==='human').map(m=>({value:m.id,label:m.name,image:image(m)}));
  const accounts=members.filter(m=>m.kind==='service'&&assignable(m,members)).map(m=>({
    value:m.id,label:assigneeLabel({name:accountName(m),kind:'service'}),description:`Владелец — ${m.ownerName||'не назначен'}`,icon:'bolt'
  }));
  const options=[{value:'',label:'Не назначен'},...people];
  if(accounts.length)options.push({value:SERVICE_HEADING,label:'Сервисные аккаунты',disabled:true,separator:true},...accounts);
  const id=current.ownerId;
  if(id&&!options.some(o=>o.value===id)){
    const member=members.find(m=>m.id===id),kind=current.ownerKind??member?.kind??'human';
    if(kind==='service'){
      const state=current.ownerState&&current.ownerState!=='active'?current.ownerState:member?memberState(member):'former';
      const name=current.ownerName||accountName(member)||'Сервисный аккаунт';
      options.push({value:id,label:assigneeLabel({name,kind,state}),description:STATE_HINTS[state]||'Может только читать задачи проекта.',icon:'bolt'});
    }else options.push({value:id,label:current.ownerName||current.owner||'Бывший участник',description:'Больше не участник проекта'});
  }
  return options;
}

/** Owners in a filter: people first, then service accounts; `group` names the heading the first account starts. */
export function groupOwners(owners){
  const people=owners.filter(o=>o.kind!=='service'),accounts=owners.filter(o=>o.kind==='service');
  return [...people,...accounts.map((o,i)=>i?o:{...o,group:'Сервисные аккаунты'})];
}
