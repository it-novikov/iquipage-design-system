import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invitationFlow,PENDING_INVITATION_KEY} from '../web/invitation-flow.js';
// The recipient's path, with a fake address bar and both browser stores: nothing but sessionStorage may hold a token.
const TOKEN='invite_'+'A'.repeat(43),OTHER='invite_'+'b_-'.repeat(14)+'c';
function memory(){const map=new Map();return {map,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),clear:()=>map.clear()};}
function browser(url){
  const location={},set=href=>{const u=new URL(href,'https://sprintique.test'+(location.pathname||'/')+(location.search||''));Object.assign(location,{pathname:u.pathname,search:u.search,hash:u.hash,href:u.href});};
  set(url);
  const history={replaceState:(_state,_title,href)=>set(String(href))};
  const session=memory(),local=memory();
  // The module defaults to the global stores: install both so a slip into localStorage would show.
  globalThis.sessionStorage=session;globalThis.localStorage=local;globalThis.location=location;globalThis.history=history;
  return {location,history,session,local,flow:()=>invitationFlow(),
    // A provider round trip or a reload: the page starts again, the hash may be gone, sessionStorage stays.
    navigate(href){set(href);}};
}

test('a token from the address waits through the sign-in and comes back once',()=>{
  const b=browser('/#invite/'+TOKEN);
  assert.equal(b.flow().keep(),TOKEN);
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),TOKEN);
  b.navigate('/?code=123');                                  // a provider sent the browser back without the hash
  assert.equal(b.flow().restore(),TOKEN);
  assert.equal(b.location.hash,'#invite/'+TOKEN);
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),null,'read once');
  b.flow().leave();                                          // accepted or refused
  assert.equal(b.location.hash,'#tasks');
  b.navigate('/');
  assert.equal(b.flow().restore(),null,'nothing to restore the second time');
  assert.equal(b.local.map.size,0);
});

test('an address that still has the token is left as it is',()=>{
  const b=browser('/#invite/'+TOKEN);b.flow().keep();
  assert.equal(b.flow().restore(),TOKEN);assert.equal(b.location.hash,'#invite/'+TOKEN);
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),null);
});

test('a mismatch signs out with the token kept; the right address accepts it afterwards',()=>{
  const b=browser('/#invite/'+TOKEN);b.flow().keep();b.flow().restore();
  const flow=b.flow(),token=flow.fromAddress();
  const next=flow.handOver(token);                           // «Войти с другой почтой», before /logout
  assert.equal(next,'/#invite/'+TOKEN);
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),TOKEN);
  b.navigate(next);                                          // reload: the sign-in screen
  b.flow().keep();
  b.navigate('/');                                           // signed in with the invited address, hash lost
  assert.equal(b.flow().restore(),TOKEN);
  assert.equal(b.flow().fromAddress(),TOKEN,'the accept dialog finds it');
  b.flow().leave();
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),null);
  assert.equal(b.local.map.size,0);
});

test('a spent link is dropped: on the sign-in screen and after an answer',()=>{
  const b=browser('/?project=x#invite/'+TOKEN);b.flow().keep();
  b.flow().drop();                                           // expired, revoked, replaced or used
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),null);
  assert.equal(b.location.hash,'');assert.equal(b.location.search,'?project=x');
  assert.equal(b.flow().restore(),null);

  const c=browser('/#invite/'+OTHER);c.flow().keep();c.navigate('/');c.flow().restore();
  c.flow().leave();                                          // the accept answered «gone»
  assert.equal(c.location.hash,'#tasks');assert.equal(c.session.getItem(PENDING_INVITATION_KEY),null);
});

test('a malformed token is ignored everywhere',()=>{
  const b=browser('/#invite/invite_short');
  assert.equal(b.flow().fromAddress(),null);
  assert.equal(b.flow().keep(),null);
  assert.equal(b.session.map.size,0);
  b.session.setItem(PENDING_INVITATION_KEY,'invite_<script>');b.navigate('/');
  assert.equal(b.flow().restore(),null);
  assert.equal(b.location.hash,'');
  assert.equal(b.session.getItem(PENDING_INVITATION_KEY),null,'a bad value is not kept either');
  assert.equal(b.flow().handOver('javascript:alert(1)'),'/');
  assert.equal(b.session.map.size,0);
});

test('storage that throws does not break the path, and nothing reaches localStorage',()=>{
  const b=browser('/#invite/'+TOKEN);
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const flow=invitationFlow({location:b.location,history:b.history,storage:broken});
  assert.equal(flow.keep(),TOKEN);assert.equal(flow.restore(),TOKEN);flow.leave();
  assert.equal(b.location.hash,'#tasks');assert.equal(b.local.map.size,0);
});
