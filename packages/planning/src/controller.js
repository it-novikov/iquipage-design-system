import {Selection, validateGroups, validateRows, mergeRows, selectableRows} from './model.js';
/** Async orchestration only. Membership, counts and permissions come from the port. */
export class PlanningController {
  constructor({adapter, projectId, onChange = () => {}}) {
    if (!adapter?.listGroups || !adapter?.listRows || !projectId) throw new Error('Нужен адаптер Планирования и проект.');
    this.adapter=adapter; this.projectId=projectId; this.onChange=onChange; this.selection=new Selection();
    this.groups=[]; this.filters={query:'',preparation:'all',sort:'planned'}; this.capabilities={};
    this.revision=null; this.nextCursor=null; this.loading=false; this.error=''; this.message='';
    this.generation=0; this.closed=false; this.abort=new AbortController(); this.rowRequests=new Map(); this.collapsed=new Set();
  }
  emit() { if (!this.closed) this.onChange(this); }
  visibleRows() { return selectableRows(this.groups); }
  async load({append=false}={}) {
    if (this.closed || append && (this.loading || !this.nextCursor)) return;
    const cursor=append?this.nextCursor:null;
    this.abort.abort(); this.abort=new AbortController(); const signal=this.abort.signal, generation=++this.generation;
    for (const request of this.rowRequests.values()) request.abort(); this.rowRequests.clear();for(const group of this.groups)group.busy=false;
    this.loading=true; this.error=''; this.emit();
    try {
      const page=validateGroups(await this.adapter.listGroups({projectId:this.projectId,...this.filters,cursor,signal}),this.projectId);
      if (this.closed || generation!==this.generation) return;
      if (append && page.revision!==this.revision) throw new Error('Состав изменился. Обновите список перед продолжением.');
      if (page.nextCursor && page.nextCursor===cursor) throw new Error('Сервер повторил курсор. Обновите список.');
      const previous = new Map(this.groups.map(g=>[g.id,g]));
      if (append && page.items.some(g=>previous.has(g.id))) throw new Error('Повторная страница релизов. Обновите список.');
      const groups=page.items.map(g=>({...g, rows:[], nextCursor:null, loaded:false, busy:false, error:'',folded:previous.get(g.id)?.folded??false}));
      this.groups=append?[...this.groups,...groups]:groups; this.nextCursor=page.nextCursor; this.revision=page.revision;
      this.capabilities=page.capabilities||{};
    } catch(error) { if (!signal.aborted && generation===this.generation) this.error=error.message||'Не удалось загрузить релизы.'; }
    finally { if (generation===this.generation && !this.closed) {this.loading=false;this.emit();} }
  }
  async rows(id,{append=false,force=false}={}) {
    const group=this.groups.find(g=>g.id===id);
    if (this.closed || !group || group.busy || !force && !append && group.loaded || append && !group.nextCursor) return;
    this.rowRequests.get(id)?.abort(); const request=new AbortController(); this.rowRequests.set(id,request);
    const generation=this.generation, cursor=append?group.nextCursor:null, revision=this.revision;
    group.busy=true;group.error='';this.emit();
    try {
      const page=validateRows(await this.adapter.listRows({projectId:this.projectId,groupId:id,revision,...this.filters,cursor,collapsedTaskIds:[...this.collapsed],signal:request.signal}),this.projectId,id,revision);
      if (this.closed || request.signal.aborted || generation!==this.generation) return;
      if (page.nextCursor && page.nextCursor===cursor) throw new Error('Повторная страница задач. Обновите группу.');
      group.rows=append?mergeRows(group.rows,page.rows):page.rows; group.nextCursor=page.nextCursor;group.loaded=true;
    } catch(error) { if (!request.signal.aborted && generation===this.generation) group.error=error.message||'Не удалось загрузить задачи.'; }
    finally { if (generation===this.generation && !this.closed && this.rowRequests.get(id)===request) {group.busy=false;this.rowRequests.delete(id);this.emit();} }
  }
  async filter(patch) {
    this.filters={...this.filters,...patch}; const count=this.selection.ids.size;this.selection.clear();
    this.message=count?'Выделение снято при изменении условий.':'';
    await this.load();
  }
  async disclose(groupId,taskId) {
    const group=this.groups.find(g=>g.id===groupId);if (!group || group.busy || this.loading) return;
    this.collapsed.has(taskId)?this.collapsed.delete(taskId):this.collapsed.add(taskId);
    await this.rows(groupId,{force:true});
  }
  fold(id) { const group=this.groups.find(g=>g.id===id);if(group){group.folded=!group.folded;this.emit();if(!group.folded)void this.rows(id);} }
  toggle(id,range=false){this.selection.toggle(id,this.visibleRows(),range);this.emit();}
  all(groupId){this.selection.all(groupId?this.visibleRows().filter(r=>this.groups.find(g=>g.id===groupId)?.rows.includes(r)):this.visibleRows());this.emit();}
  clear(){this.selection.clear();this.emit();}
  destroy(){this.closed=true;this.generation++;this.abort.abort();for(const r of this.rowRequests.values())r.abort();this.rowRequests.clear();this.selection.clear();}
}
