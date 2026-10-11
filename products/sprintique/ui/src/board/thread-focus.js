const actions=['data-thread-toggle','data-older-replies','data-reply','data-resolve','data-retry-thread','data-answer-question','data-review-question','data-discard-answer','data-work-action'];
/** Keep keyboard focus through a synchronous thread redraw, including its temporarily disabled state. */
export function createThreadFocus(active=()=>document.activeElement){
  const pending=new Map();
  return {
    capture(id,node){
      const field=active();
      if(!node?.contains(field)){pending.clear();return null;}
      if(field===node)return pending.get(id)||null;
      const action=actions.find(name=>field.hasAttribute(name));
      const state=action?{action,value:field.getAttribute(action)}:field.closest('[data-question]')&&['INPUT','TEXTAREA','H3'].includes(field.tagName)?{tag:field.tagName,value:field.value,start:field.selectionStart,end:field.selectionEnd}:null;
      if(state)pending.set(id,state);else pending.delete(id);
      return state;
    },
    restore(id,node,state){
      if(!state)return;
      const field=state.action?[...node.querySelectorAll(`[${state.action}]`)].find(el=>el.getAttribute(state.action)===state.value):state.tag==='TEXTAREA'?node.querySelector('[data-question] textarea'):state.tag==='H3'?node.querySelector('[data-question] h3'):[...node.querySelectorAll('[data-question] input')].find(el=>el.value===state.value);
      if(field&&!field.matches(':disabled')){
        if(field.tagName==='H3')field.tabIndex=-1;
        field.focus({preventScroll:true});if(field.tagName==='TEXTAREA')field.setSelectionRange(state.start,state.end);
      }else{
        // A pending action remains in its thread. Once answered, the question heading is the destination.
        const target=field?node:node.querySelector('[data-question] h3')||node;
        target.tabIndex=-1;target.focus({preventScroll:true});
      }
    }
  };
}
