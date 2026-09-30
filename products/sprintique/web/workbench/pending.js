// Decisions that wait for their undo time (design-v2 §11.3: «Утвердить» with «Отменить»), shared by the Workbench rows
// and the task drawer, so the same request is never decided twice and either place can take it back. While any
// decision waits, leaving the page asks first; a hidden page sends what is waiting.
const waiting=new Map();// request id → {cancel(), commit(), leave()}

export const isPending=requestId=>waiting.has(requestId);
/** Every change is announced on window as `dsk-pending-change`, so each place redraws what it shows. */
const changed=requestId=>window.dispatchEvent(new CustomEvent('dsk-pending-change',{detail:{requestId}}));
export function hold(requestId,entry){waiting.set(requestId,entry);changed(requestId);}
export function release(requestId){if(waiting.delete(requestId))changed(requestId);}
export function commitPending(requestId){const entry=waiting.get(requestId);if(entry){waiting.delete(requestId);changed(requestId);return entry.commit();}return Promise.resolve();}
export function cancelPending(requestId){const entry=waiting.get(requestId);if(entry){waiting.delete(requestId);entry.cancel();changed(requestId);return true;}return false;}

window.addEventListener('beforeunload',event=>{if(waiting.size){event.preventDefault();event.returnValue='';}});
// An unloading page cancels ordinary requests: what waits is sent by a request that outlives it (`leave`).
window.addEventListener('pagehide',()=>{for(const [id,entry] of waiting){waiting.delete(id);void (entry.leave||entry.commit)();}});
