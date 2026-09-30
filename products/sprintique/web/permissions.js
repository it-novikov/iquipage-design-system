/** Permission rules mirrored from the server (access/domain/Permissions.kt). Pure: no DOM, tested in node.
 *  The server checks every change again; these only keep the editor honest before it asks. */
export const TASKS_READ='tasks.read',PROJECT_ACCESS='project.access';
export const WORKSPACE_PERMISSIONS=['workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings'];
/** Derived project roles of an older session without permissions[]: the system presets they came from. */
const LEGACY={
  admin:['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write','finance.read','finance.write','approvals.decide','agents.manage','members.invite','members.manage','project.settings','project.access'],
  editor:['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write','finance.read','approvals.decide'],
  reader:['tasks.read','threads.write','maps.read','finance.read']};
export const projectPermissions=project=>Array.isArray(project?.permissions)?project.permissions:LEGACY[project?.role]||[];
export const can=(project,permission)=>projectPermissions(project).includes(permission);
export const canWorkspace=(project,permission)=>(project?.workspacePermissions||[]).includes(permission);
/** A string that changes whenever the person's permissions in the project change. */
export const accessSignature=project=>[...projectPermissions(project)].sort().join(',');

/** Catalog groups ({group,permissions:[{id,title,description,includes}]}) as one ordered index. */
export const catalogIndex=groups=>new Map((groups||[]).flatMap(g=>g.permissions.map(p=>[p.id,p])));
export const ordered=(index,ids)=>{const set=new Set(ids);return [...index.keys()].filter(id=>set.has(id));};
/** The permissions and everything they include, in catalog order. Unknown ids are dropped. */
export function closure(index,ids){
  const found=new Set(),add=id=>{if(found.has(id)||!index.has(id))return;found.add(id);for(const d of index.get(id).includes||[])add(d);};
  for(const id of ids)add(id);return new Set(ordered(index,found));
}
/** closure(base ∪ granted ∪ {tasks.read}) without every permission whose closure meets revoked ∪ forbidden. */
export function compile(index,{base=[],granted=[],revoked=[],forbidden=[]}={}){
  const removed=new Set([...revoked,...forbidden]);removed.delete(TASKS_READ);
  return new Set([...closure(index,[...base,...granted,TASKS_READ])].filter(p=>![...closure(index,[p])].some(x=>removed.has(x))));
}
/** Permissions of `within` that need `id` (itself included). */
export const dependents=(index,id,within)=>ordered(index,[...within].filter(p=>closure(index,[p]).has(id)));
/** Turning a permission on turns on what it includes. Returns the new set and what came along. */
export function enable(index,effective,id){
  const next=new Set(effective),also=[];
  for(const p of closure(index,[id])){if(!next.has(p)&&p!==id)also.push(p);next.add(p);}
  return {effective:new Set(ordered(index,next)),also};
}
/** Turning a permission off turns off everything that depends on it. «Видеть задачи» stays: it is membership. */
export function disable(index,effective,id){
  if(id===TASKS_READ)return {effective:new Set(effective),also:[]};
  const gone=dependents(index,id,effective);
  return {effective:new Set(ordered(index,[...effective].filter(p=>!gone.includes(p)))),also:gone.filter(p=>p!==id)};
}
export const toggle=(index,effective,id,on)=>on?enable(index,effective,id):disable(index,effective,id);
/** What turning `id` on would bring along, or turning it off would take away (for hints before the click). */
export const wouldEnable=(index,effective,id)=>[...closure(index,[id])].filter(p=>p!==id&&!effective.has(p));
export const wouldDisable=(index,effective,id)=>dependents(index,id,effective).filter(p=>p!==id);
/** Elements of `set` not included by another element: the fewest additions that give the whole set. */
const tops=(index,items)=>{const set=new Set(items);return ordered(index,[...set].filter(x=>![...set].some(y=>y!==x&&closure(index,[y]).has(x))));};
/** Elements of `set` that include nothing else of it: the fewest removals that take the whole set away. */
const roots=(index,items)=>{const set=new Set(items);return ordered(index,[...set].filter(x=>[...closure(index,[x])].every(y=>y===x||!set.has(y))));};
/** The personal change that turns a preset into `effective`, as the server stores it: few added, few removed. */
export function difference(index,preset,effective){
  const base=closure(index,[...preset,TASKS_READ]),target=new Set(effective);
  return {granted:tops(index,[...target].filter(p=>!base.has(p))),revoked:roots(index,[...base].filter(p=>!target.has(p)&&p!==TASKS_READ))};
}
/** Where a permission of the editor comes from: 'preset', 'added', 'removed' or '' (neither in preset nor given). */
export function source(index,preset,effective,id){
  const base=closure(index,[...preset,TASKS_READ]),on=effective.has(id);
  return on?(base.has(id)?'preset':'added'):(base.has(id)?'removed':'');
}
/** A preset is within someone's reach when everything it gives is theirs. */
export const within=(index,preset,held)=>{const own=new Set(held);return [...closure(index,[...preset,TASKS_READ])].every(p=>own.has(p));};

/**
 * Service accounts (catalog `service`): 'preset' — may come with a service preset, 'explicit' — only as a personal
 * addition (finance), 'never' — the decisions and access of people. The database compiles an account's permissions as
 * (closure(preset without explicit ∪ granted) \ cascade(revoked)) ∩ its owner's permissions there, never the 'never'
 * ones; the server refuses a change whose result is wider than the owner (SERVICE_RESTRICTED).
 */
export const serviceUse=(index,id)=>index.get(id)?.service||'preset';
/** What a service preset brings by itself: explicit and never permissions do not come from a preset. */
export const serviceBase=(index,preset)=>(preset||[]).filter(id=>serviceUse(index,id)==='preset');
/** Permissions an account cannot hold here: never ones, and what its owner lacks (null: the owner is not in the project). */
export const serviceForbidden=(index,owner)=>{const has=owner?new Set(owner):null;return [...index.keys()].filter(id=>serviceUse(index,id)==='never'||!has||!has.has(id)&&id!==TASKS_READ);};
/** What an account holds with a preset and personal changes, under its owner, as the database compiles it. */
export const serviceEffective=(index,{preset=[],granted=[],revoked=[],owner=null})=>compile(index,{base:serviceBase(index,preset),granted,revoked,forbidden:serviceForbidden(index,owner)});
/** Personal additions that do not apply because the owner lacks them (the owner's rights were narrowed since). */
export const inactiveGrants=(index,granted=[],owner=null)=>{const has=new Set(owner||[]);return ordered(index,granted.filter(id=>!has.has(id)));};

/**
 * Where each permission of a service account comes from, from its members row when GET …/effective is closed to the
 * actor (it needs members.manage; the owner or someone with agents.manage sees the row): the preset, the additions and
 * removals the server lists, the permissions service accounts never hold. Pure.
 */
export function serviceSources(index,member,presetPermissions=[]){
  const held=new Set(member.permissions||[]),base=closure(index,[...serviceBase(index,presetPermissions),TASKS_READ]);
  const added=new Set(closure(index,member.added||[])),removed=new Set(member.removed||[]),granted=new Set(member.granted||[]);
  // Not held although the preset or an addition gives it and nobody removed it: the owner's ceiling («недоступно»).
  const capped=id=>(base.has(id)||granted.has(id))&&!removed.has(id);
  return Object.fromEntries([...index.keys()].map(id=>[id,serviceUse(index,id)==='never'?'forbidden':held.has(id)?(base.has(id)?'preset':added.has(id)?'added':'dependency'):capped(id)?'forbidden':base.has(id)?'removed':'absent']));
}

/**
 * Who may change whom among the people of a workspace (the server's rules, WorkspaceAccess.change): the owner row only
 * by transfer; only the owner changes or removes an administrator; appointing one needs all five workspace permissions;
 * nobody changes someone holding workspace permissions they lack. Returns the roles one may pick and removal.
 */
export function workspaceRowRights({actorId,role,permissions=[]},member){
  const own=new Set(permissions),owner=role==='owner',none={roles:[],remove:false,transfer:false};
  if(!member||member.id===actorId||member.role==='owner')return none;
  const transfer=owner&&['admin','member'].includes(member.role);
  if(!own.has('workspace.people'))return {...none,transfer};
  if(member.role==='admin'&&!owner)return {...none,transfer};
  if(!owner&&(member.permissions||[]).some(p=>!own.has(p)))return {...none,transfer};
  const appoint=WORKSPACE_PERMISSIONS.every(p=>own.has(p))||member.role==='admin';
  const roles=member.role==='guest'?['guest','member']:[...(appoint?['admin']:[]),'member','guest'];
  return {roles,remove:true,transfer};
}
/**
 * Whether the person may create projects in a workspace. GET /workspaces lists the compiled `permissions` of one's
 * membership: the owner and administrators hold projects.create there unless the owner took it away. A member creates
 * by the workspace rule (projectsCreatedBy 'members') unless it was revoked for them personally; only GET
 * /workspaces/{id}/access applies both (its `permissions` include projects.create exactly when the server allows), so a
 * member's answer comes from there (`access`). Without it the rule alone decides and the server refuses the rare
 * personal revocation.
 */
export function mayCreateProjects(workspace,access=null){
  if((workspace?.permissions||[]).includes('projects.create'))return true;
  if(workspace?.role!=='member')return false;
  return access?Array.isArray(access.permissions)?access.permissions.includes('projects.create'):access.projectsCreatedBy==='members':false;
}
