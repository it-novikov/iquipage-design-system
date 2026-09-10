 get surfaceMode(){return this.getAttribute('surface-mode')||'standard'}
 set surfaceMode(value){if(!['standard','embedded'].includes(value))throw new TypeError('surfaceMode');this.setAttribute('surface-mode',value)}
 get saving(){return !!this.pending}
 get dirty(){return !!(this.pending||this.retryValue||this.conflict||(this.editing&&this.editIsDirty()))}
 get draftData(){return B.clone(this.editing&&this.editIsDirty()?this.editDraft():this.conflict||this.retryValue||this.data)}
 flush(){this.finishEdit(true);return !this.dirty}
 applyDocument(value,baseRevision,reason='host-edit'){
  if(baseRevision!==this.data.revision)throw new Error('Карта изменилась. Обновите предложение.');
  return this.commit(B.validateBoard(value),String(reason).slice(0,80));
 }
 command(id){
  const allowed=['quick-note','bulk','search','frames','menu','undo','redo','image','connect-form','export','export-summary','library-toggle','help','templates','session'];
  if(!allowed.includes(id))throw new TypeError('Unsupported board command');
  this.finishEdit(true);this.action(id);
 }
