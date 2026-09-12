 get surfaceMode(){return this.getAttribute('surface-mode')||'standard'}
 set surfaceMode(value){if(!['standard','embedded'].includes(value))throw new TypeError('surfaceMode');this.setAttribute('surface-mode',value)}
 get allowedCreateTypes(){return [...(this._allowedCreateTypes||['sticky','text','task','shape','frame','image'])]}
 set allowedCreateTypes(value){
  const allowed=['sticky','text','task','shape','frame','image'];
  if(!Array.isArray(value)||value.some(type=>!allowed.includes(type)))throw new TypeError('allowedCreateTypes');
  this._allowedCreateTypes=[...new Set(value)];this.render();
 }
 assertHostMutation(next,reason,historyAction){
  if(reason==='host-edit'||historyAction)return next;
  const before=new Map(this._data.objects.map(object=>[object.id,object]));
  for(const object of next.objects){
   const previous=before.get(object.id);
   if((!previous||previous.type!==object.type)&&!this.allowedCreateTypes.includes(object.type))throw new Error('Создание этого типа объекта отключено приложением.');
   if(!previous&&object.externalTaskId)throw new Error('Внешнюю задачу добавляет приложение.');
   if(previous?.externalTaskId){
    const fields=['type','text','owner','done','externalTaskId'];
    if(fields.some(field=>previous[field]!==object[field]))throw new Error('Содержимое внешней задачи изменяется в разделе задач.');
   }
  }
  return next;
 }
 get saving(){return !!this.pending}
 get editorMode(){return this.getAttribute('editor-mode')||'inline'}
 set editorMode(value){if(!['inline','host'].includes(value))throw new TypeError('editorMode: inline | host');this.setAttribute('editor-mode',value);}
 get dirty(){return !!(this.pending||this.retryValue||this.conflict||(this.editing&&this.editIsDirty()))}
 get draftData(){return B.clone(this.editing&&this.editIsDirty()?this.editDraft():this.conflict||this.retryValue||this.data)}
 flush(){this.finishEdit(true);return !this.dirty}
 applyDocument(value,baseRevision,reason='host-edit'){
  if(baseRevision!==this.data.revision)throw new Error('Карта изменилась. Обновите предложение.');
  return this.commit(B.validateBoard(value),String(reason).slice(0,80));
 }
 command(id){
  const allowed=['edit','quick-note','bulk','search','frames','menu','undo','redo','image','connect-form','export','export-summary','library-toggle','help','templates','session'];
  if(!allowed.includes(id))throw new TypeError('Unsupported board command');
  this.finishEdit(true);this.action(id);
 }

 prepareDocument(value,ids=[]){
  if(!this.isConnected||!this.shell)throw new Error('Доска ещё не подключена.');
  const next=B.validateBoard(value),selected=new Set(ids);
  for(const o of next.objects){
   if(!selected.has(o.id))continue;
   if(o.type==='frame'){
    const header=this.measureText({...o,autoHeight:true},o.text);
    o.height=Math.max(o.height,header+64);o.headerHeight=header;
   }else if(o.type==='image'){
    const caption=this.measureText({...o,autoHeight:true},o.text);
    o.height=o.height-(o.captionHeight||32)+caption;o.captionHeight=caption;
   }else o.height=this.measureText(o,o.text);
  }
  return B.validateBoard(next);
 }
