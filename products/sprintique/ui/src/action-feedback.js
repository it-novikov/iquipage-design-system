import {recentFailure,actionError,notify,pending,trackActivity,reportNetworkFailure} from '@iquipage/web/core';
let quiet=0;
/** Requests started synchronously inside fn are background work: no line, no slow notice, no pending button. */
export function background(fn){quiet++;try{return fn();}finally{quiet--;}}

/** fetch for the product's HTTP client. The caller gets fetch's own promise; the tracker sees an HTTP error as a failure. */
export function trackedFetch(input,init={}){
  const request=fetch(input,init);
  request.catch(error=>{if(error?.name!=='AbortError')reportNetworkFailure();});
  if(quiet||init.keepalive)return request;
  const method=String(init.method||'GET').toUpperCase();
  const outcome=request.then(response=>response.ok?response:Promise.reject(response));outcome.catch(()=>{});
  trackActivity(outcome,{kind:method==='GET'||method==='HEAD'?'read':'write'});
  return request;
}

/** Tracks work that is not a request of the client (an XHR upload, a raw fetch) as the same activity. */
export function track(promise,kind='write'){const outcome=Promise.resolve(promise);outcome.catch(()=>{});trackActivity(outcome,{kind});return promise;}


/**
 * Reports a failure where the action was (DS vnext.35): next to the button whose request just failed, with «Повторить»
 * (a second press of it; commands carry idempotency keys, so a repeat is safe). Without such a button, a toast as
 * before. Returns true when it was shown next to the button.
 */
export function failed(error,{message='Не удалось выполнить действие',description=error?.message||'Повторите попытку.',retry=true}={}){
  if(!error||error.cancelled||error.name==='AbortError')return false;
  const button=recentFailure();
  if(button){actionError(button,description,{title:message,retry:retry?()=>button.click():undefined});return true;}
  notify({tone:'danger',message,description,duration:10000});return false;
}
/** A press whose work is more than one request (or no request at all): the same pending look and the error next to it. */
export async function act(button,work,{message='Не удалось выполнить действие',retry}={}){
  try{return await pending(button,work);}
  catch(error){
    if(error?.cancelled||error?.name==='AbortError')return undefined;
    if(button?.isConnected)actionError(button,error?.message||'Повторите попытку.',{title:message,retry});
    else notify({tone:'danger',message,description:error?.message||'Повторите попытку.',duration:10000});
    return undefined;
  }
}
export {pending};
