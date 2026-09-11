/** Public DS properties only. One editor owns its draft, history and both views. */
export function mountTaskDescription(root,{value='',editing=false,readOnly=false}){
  const editor=root.querySelector('iq-markdown-editor');
  const abort=new AbortController();
  editor.value=value;
  editor.readOnly=readOnly;
  editor.interactiveTasks=!readOnly;
  editor.previewOnBlur=true;
  const sync=()=>{root.dataset.mode=editor.previewMode?'preview':'edit';};
  editor.addEventListener('iq-preview-change',sync,{signal:abort.signal});
  editor.previewMode=!editing||readOnly;
  sync();
  return {refresh(){sync();},destroy(){abort.abort();}};
}
