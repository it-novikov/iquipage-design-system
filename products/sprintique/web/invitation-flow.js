/**
 * The recipient's path of an invitation link (#invite/<token>) across the sign-in. Pure: the address, history and
 * storage are injected (tested in node). The token waits only in sessionStorage — one tab, gone with it — never in
 * localStorage, cookies or a query string; it is read once after sign-in and dropped when the link is spent.
 *
 *   sign-in screen: keep()        — the token from the address waits across a provider redirect or a code sign-in
 *   after sign-in:  restore()     — once: puts a waiting token back into the address (a provider drops the hash)
 *   accept dialog:  fromAddress() — the token to inspect and accept; leave() once accepted, refused or spent
 *   wrong address:  handOver()    — before «Войти с другой почтой» signs out: the token waits for the next sign-in
 *   spent link:     drop()        — on the sign-in screen, explained once and forgotten
 */
export const PENDING_INVITATION_KEY='sprintique.pending-invitation';
export const INVITATION_TOKEN=/^#invite\/(invite_[A-Za-z0-9_-]{43})$/;
const VALID=/^invite_[A-Za-z0-9_-]{43}$/;
export function invitationFlow({location=globalThis.location,history=globalThis.history,storage=globalThis.sessionStorage}={}){
  // A browser that refuses storage (private mode, blocked site data) still accepts a link opened after sign-in.
  const get=()=>{try{return storage?.getItem(PENDING_INVITATION_KEY)||null;}catch{return null;}};
  const set=token=>{try{storage?.setItem(PENDING_INVITATION_KEY,token);}catch{/* the address still carries it */}};
  const remove=()=>{try{storage?.removeItem(PENDING_INVITATION_KEY);}catch{/* nothing kept */}};
  const fromAddress=()=>String(location.hash||'').match(INVITATION_TOKEN)?.[1]||null;
  return {
    fromAddress,
    keep(){const token=fromAddress();if(token)set(token);return token;},
    restore(){
      const pending=get();remove();
      if(pending&&VALID.test(pending)&&!String(location.hash||'').startsWith('#invite/'))history.replaceState(null,'','#invite/'+pending);
      return fromAddress();
    },
    /** The address to reload after signing out: the sign-in screen keeps the token from it again. */
    handOver(token){if(!VALID.test(token))return '/';set(token);return '/#invite/'+token;},
    leave(){remove();if(String(location.hash||'').startsWith('#invite/'))history.replaceState(null,'','#tasks');},
    drop(){remove();if(String(location.hash||'').startsWith('#invite/'))history.replaceState(null,'',location.pathname+location.search);},
  };
}
