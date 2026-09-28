import {motionReduced} from '@iquipage/web/core';

/** Replays how a template gets filled in, from the roles template-preview.js writes on the SVG:
 *  clear, a slow pull-back establishing shot, areas draw in, notes land with a settle, steps slide along the flow,
 *  links draw with the head arriving last (a pulse travels them in flow templates), the outcome gets its ring and
 *  check, then the camera pushes in on it and holds. Only transform, opacity and stroke-dashoffset move.
 *  With reduced motion nothing moves: the preview shows the answer state instead. */
const EASE={camera:'cubic-bezier(.22,.61,.12,1)',draw:'cubic-bezier(.65,0,.35,1)',settle:'cubic-bezier(.34,1.4,.64,1)',out:'cubic-bezier(.2,.7,.2,1)',spring:'cubic-bezier(.16,1,.3,1)',clear:'cubic-bezier(.4,0,1,1)',push:'cubic-bezier(.33,0,.15,1)',pulse:'cubic-bezier(.45,0,.2,1)'};
const CLEAR=200,OUTCOME_BY=3400,HOLD=1400;
const REST='translate(0px, 0px) scale(1) rotate(0deg)';

/** Keyframes at absolute times (ms). Easing on a point applies to the segment that starts there. */
function track(list,element,points){
  const sorted=points.filter(Boolean).sort((a,b)=>a.t-b.t),end=Math.max(1,sorted.at(-1).t);
  list.push({element,end,keyframes:sorted.map(({t,easing,...props})=>({...props,offset:Math.min(1,Math.max(0,t/end)),...(easing?{easing}:{})}))});
}
const byOrder=(a,b)=>Number(a.dataset.order)-Number(b.dataset.order);

/** The full timeline for one SVG, as data, so tests can check the story budget without a browser. */
export function storyPlan(svg){
  const story=svg.dataset.story||'columns',stages=[...svg.querySelectorAll('.map-preview-stage')].sort(byOrder);
  let nodes=[...svg.querySelectorAll('.map-preview-node')].sort(byOrder);
  const lines=[...svg.querySelectorAll('.map-preview-link')];
  const links=lines.map(line=>{const j=line.dataset.link;return {j,line,from:line.dataset.from,to:line.dataset.to,halo:svg.querySelector(`.map-preview-halo[data-link="${j}"]`),origin:svg.querySelector(`.map-preview-origin[data-link="${j}"]`),head:svg.querySelector(`.map-preview-head[data-link="${j}"] path`)};});
  const outcome=nodes.find(node=>node.dataset.role==='outcome');
  if(story==='structure'&&links.length){
    // Built centre-out: the hub first, then its neighbours, then the rest.
    const degree=new Map();for(const l of links){degree.set(l.from,(degree.get(l.from)||0)+1);degree.set(l.to,(degree.get(l.to)||0)+1);}
    const hub=outcome||nodes.reduce((a,n)=>(degree.get(n.dataset.node)||0)>(degree.get(a.dataset.node)||0)?n:a,nodes[0]);
    const near=new Set(links.flatMap(l=>l.from===hub.dataset.node?[l.to]:l.to===hub.dataset.node?[l.from]:[]));
    nodes=[hub,...nodes.filter(n=>n!==hub&&near.has(n.dataset.node)),...nodes.filter(n=>n!==hub&&!near.has(n.dataset.node))];
  }
  const t={frames:new Map(),nodes:new Map(),links:new Map()};
  const stagger=story==='columns'?140:90;
  stages.forEach((stage,k)=>t.frames.set(stage,260+stagger*k));
  const landing=node=>node.dataset.role==='input'?460:420;
  let lastLanding=stages.length?260+stagger*(stages.length-1)+480:700;
  if(story==='columns'&&stages.length){
    const groups=new Map();for(const node of nodes){const f=node.dataset.frame;if(!groups.has(f))groups.set(f,[]);groups.get(f).push(node);}
    [...groups.values()].forEach((group,g)=>group.forEach((node,i)=>{const start=700+g*300+i*60;t.nodes.set(node,start);lastLanding=Math.max(lastLanding,start+landing(node));}));
  }else{
    const s=Math.min(110,880/Math.max(1,nodes.length-1));
    nodes.forEach((node,k)=>{const start=700+s*k;t.nodes.set(node,start);lastLanding=Math.max(lastLanding,start+landing(node));});
  }
  const rank=id=>Number(svg.querySelector(`.map-preview-node[data-node="${CSS.escape(id)}"]`)?.dataset.rank||0);
  const ordered=[...links].sort((a,b)=>rank(a.from)-rank(b.from)||rank(a.to)-rank(b.to));
  ordered.forEach((link,j)=>t.links.set(link,lastLanding+180+170*j));
  const intoOutcome=outcome?ordered.filter(link=>link.to===outcome.dataset.node):[];
  let outcomeStart=intoOutcome.length?Math.max(...intoOutcome.map(link=>t.links.get(link)+560))+80:lastLanding+200;
  // Budget: the outcome check starts by 3.4s; long stories compress their staggers (never below 60%).
  const factor=outcomeStart>OUTCOME_BY?Math.max(.6,OUTCOME_BY/outcomeStart):1;
  const scale=value=>value*factor;
  for(const map of [t.frames,t.nodes,t.links])for(const [key,value] of map)map.set(key,scale(value));
  outcomeStart=scale(outcomeStart);
  return {story,stages,nodes,links:ordered,outcome,times:t,outcomeStart,lastLanding:scale(lastLanding),factor};
}

function buildTracks(svg,plan,{flow}){
  const list=[],{story,stages,nodes,links,outcome,times,outcomeStart}=plan,push=Number(svg.dataset.push)||1;
  const linked=new Set(links.flatMap(l=>[l.from,l.to]));
  const dimAt=outcomeStart,connectorsAt=links.length?Math.min(...links.map(l=>times.links.get(l))):dimAt;
  const end=outcomeStart+1600+HOLD;
  // Camera: pull back from 1.045 onto the content, then push in on the outcome.
  track(list,svg,[
    {t:0,transform:'scale(1)',transformOrigin:svg.dataset.centre,easing:EASE.clear},
    {t:CLEAR,transform:'scale(1.045)',transformOrigin:svg.dataset.centre,easing:EASE.camera},
    {t:CLEAR+700,transform:'scale(1)',transformOrigin:svg.dataset.centre},
    {t:outcomeStart,transform:'scale(1)',transformOrigin:svg.dataset.focus,easing:EASE.push},
    {t:outcomeStart+1600,transform:`scale(${push})`,transformOrigin:svg.dataset.focus},
    {t:end,transform:`scale(${push})`,transformOrigin:svg.dataset.focus}]);
  for(const stage of stages){
    const start=times.frames.get(stage),frame=stage.querySelector('.map-preview-frame'),title=stage.querySelector('text');
    track(list,stage,[{t:0,opacity:1,easing:EASE.clear},{t:CLEAR,opacity:0},{t:start,opacity:0},{t:start,opacity:1},{t:end,opacity:1}]);
    // Resets happen only while the element is hidden (after the clear), never while it is still on screen.
    track(list,frame,[{t:0,strokeDasharray:'1 1',strokeDashoffset:0},{t:CLEAR,strokeDasharray:'1 1',strokeDashoffset:0},{t:CLEAR,strokeDasharray:'1 1',strokeDashoffset:1},{t:start,strokeDasharray:'1 1',strokeDashoffset:1,easing:EASE.draw},{t:start+480,strokeDasharray:'1 1',strokeDashoffset:0},{t:end,strokeDasharray:'1 1',strokeDashoffset:0}]);
    track(list,frame,[{t:0,fillOpacity:1},{t:CLEAR,fillOpacity:1},{t:CLEAR,fillOpacity:0},{t:start+200,fillOpacity:0,easing:EASE.out},{t:start+440,fillOpacity:1},{t:end,fillOpacity:1}]);
    if(title)track(list,title,[{t:0,opacity:1,transform:'translate(0px, 0px)'},{t:CLEAR,opacity:1,transform:'translate(0px, 0px)'},{t:CLEAR,opacity:0,transform:'translate(0px, 3px)'},{t:start+160,opacity:0,transform:'translate(0px, 3px)',easing:EASE.out},{t:start+400,opacity:1,transform:'translate(0px, 0px)'},{t:end,opacity:1,transform:'translate(0px, 0px)'}]);
  }
  nodes.forEach((node,k)=>{
    const start=times.nodes.get(node),role=node.dataset.role,type=node.dataset.type;
    const tilt=(story==='converge'?2.4:1.2)*(k%2?1:-1);
    const from=role==='decision'?'translate(0px, 0px) scale(.85) rotate(-8deg)':type==='sticky'?`translate(0px, -9px) scale(1.06) rotate(${tilt}deg)`:'translate(-6px, 0px) scale(1) rotate(0deg)';
    const duration=type==='sticky'?460:420,dim=node!==outcome;
    const points=[{t:0,opacity:1,transform:REST,easing:EASE.clear},{t:CLEAR,opacity:0,transform:REST},{t:start,opacity:0,transform:from,easing:type==='sticky'?EASE.settle:EASE.spring}];
    if(type==='sticky')points.push({t:start+duration*.55,opacity:1,transform:'translate(0px, 1.2px) scale(.992) rotate(0deg)',easing:EASE.out});
    points.push({t:start+duration,opacity:1,transform:REST});
    if(story==='converge'&&links.length&&!linked.has(node.dataset.node)&&dim)points.push({t:connectorsAt,opacity:1,transform:REST,easing:EASE.out},{t:connectorsAt+200,opacity:.7,transform:REST});
    if(dim&&push>1)points.push({t:dimAt,opacity:points.at(-1).opacity,transform:REST,easing:EASE.push},{t:dimAt+700,opacity:.62,transform:REST});
    points.push({t:end,opacity:points.at(-1).opacity,transform:REST});
    track(list,node,points);
  });
  for(const link of links){
    const start=times.links.get(link),dim=push>1?.7:1;
    // Sample the pulse before the halo gets pathLength=1 (some engines scale point lookups by it).
    if(flow&&link.halo)pulse(list,svg,link.halo,start+560,end);
    if(link.halo)link.halo.setAttribute('pathLength','1');
    for(const path of [link.halo,link.line]){
      track(list,path,[{t:0,opacity:1,easing:EASE.clear},{t:CLEAR,opacity:0},{t:start,opacity:0},{t:start,opacity:1},{t:dimAt,opacity:1,easing:EASE.push},{t:dimAt+700,opacity:dim},{t:end,opacity:dim}]);
      track(list,path,[{t:0,strokeDasharray:'1 1',strokeDashoffset:0},{t:CLEAR,strokeDasharray:'1 1',strokeDashoffset:0},{t:CLEAR,strokeDasharray:'1 1',strokeDashoffset:1},{t:start,strokeDasharray:'1 1',strokeDashoffset:1,easing:EASE.draw},{t:start+560,strokeDasharray:'1 1',strokeDashoffset:0},{t:end,strokeDasharray:'1 1',strokeDashoffset:0}]);
    }
    if(link.origin)track(list,link.origin,[{t:0,opacity:1,transform:'scale(1)',easing:EASE.clear},{t:CLEAR,opacity:0,transform:'scale(1)'},{t:CLEAR,opacity:0,transform:'scale(0)'},{t:start,opacity:0,transform:'scale(0)',easing:EASE.spring},{t:start+140,opacity:1,transform:'scale(1)'},{t:end,opacity:1,transform:'scale(1)'}]);
    if(link.head)track(list,link.head,[{t:0,opacity:1,transform:'translate(0px, 0px)',easing:EASE.clear},{t:CLEAR,opacity:0,transform:'translate(0px, 0px)'},{t:CLEAR,opacity:0,transform:'translate(-3px, 0px)'},{t:start+470,opacity:0,transform:'translate(-3px, 0px)',easing:EASE.spring},{t:start+670,opacity:1,transform:'translate(0px, 0px)'},{t:end,opacity:1,transform:'translate(0px, 0px)'}]);
  }
  const ring=svg.querySelector('.map-preview-ring'),done=svg.querySelector('.map-preview-done'),mark=svg.querySelector('.map-preview-done-mark');
  if(ring)track(list,ring,[{t:0,opacity:0,transform:'scale(1.08)'},{t:outcomeStart,opacity:0,transform:'scale(1.08)',easing:EASE.spring},{t:outcomeStart+240,opacity:1,transform:'scale(1)'},{t:end,opacity:1,transform:'scale(1)'}]);
  if(done)track(list,done,[{t:0,opacity:0},{t:outcomeStart+240,opacity:0,easing:EASE.out},{t:outcomeStart+400,opacity:1},{t:end,opacity:1}]);
  if(mark)track(list,mark,[{t:0,strokeDasharray:'1 1',strokeDashoffset:1},{t:outcomeStart+400,strokeDasharray:'1 1',strokeDashoffset:1,easing:EASE.draw},{t:outcomeStart+620,strokeDasharray:'1 1',strokeDashoffset:0},{t:end,strokeDasharray:'1 1',strokeDashoffset:0}]);
  return {list,end};
}

/** A dot travels the link once it is drawn: sampled positions, so it works wherever SVG transforms animate. */
function pulse(list,svg,path,start,end){
  const total=path.getTotalLength?.();if(!total)return;
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('class','map-preview-pulse');dot.setAttribute('r','3.2');dot.dataset.storyTemp='';
  svg.querySelector('.map-preview-overlay').append(dot);
  const samples=Array.from({length:13},(_,i)=>{const p=path.getPointAtLength(total*i/12);return {t:start+520*i/12,transform:`translate(${p.x}px, ${p.y}px)`,opacity:i===0||i===12?0:i<2||i>10?.6:1,...(i===0?{easing:EASE.pulse}:{})};});
  track(list,dot,[{t:0,opacity:0,transform:samples[0].transform},...samples,{t:end,opacity:0,transform:samples.at(-1).transform}]);
}

/** Plays one story. Returns {finished, finish(), cancel()}: finish keeps the final frame, cancel returns to rest. */
export function playTemplateStory(svg,{signal}={}){
  const preview=svg.closest('.map-template-preview');
  if(motionReduced()){preview?.setAttribute('data-answer','');const off=()=>preview?.removeAttribute('data-answer');return {finished:Promise.resolve(),finish(){},cancel:off,settle(){off();return Promise.resolve();}};}
  const plan=storyPlan(svg),{list,end}=buildTracks(svg,plan,{flow:plan.story==='flow'});
  svg.style.willChange='transform';
  const animations=list.map(({element,keyframes,end:duration})=>element.animate(keyframes,{duration,fill:'both'}));
  const cleanup=()=>{svg.style.willChange='';svg.querySelectorAll('[data-story-temp]').forEach(node=>node.remove());};
  const finished=Promise.all(animations.map(a=>a.finished)).then(()=>undefined,()=>undefined);
  const controls={finished,end,
    finish(){for(const a of animations)a.finish();},
    cancel(){for(const a of animations)a.cancel();cleanup();},
    /** Leaves the story from whatever frame it is on: every changed property eases back to rest, no cut. */
    settle(duration=280){
      const props=['opacity','transform','transformOrigin','strokeDashoffset','fillOpacity'];
      const snap=el=>{const c=getComputedStyle(el);return Object.fromEntries(props.map(p=>[p,c[p]]));};
      const targets=[...new Set(animations.map(a=>a.effect?.target).filter(el=>el?.isConnected&&!el.hasAttribute('data-story-temp')))];
      const before=new Map(targets.map(el=>[el,snap(el)]));
      svg.querySelectorAll('[data-story-temp]').forEach(node=>node.remove());
      for(const a of animations)a.cancel();cleanup();
      const moves=[];
      for(const el of targets){
        const from=before.get(el),to=snap(el),changed=props.filter(p=>from[p]!==to[p]);if(!changed.length)continue;
        const start={},stop={};for(const p of changed){start[p]=from[p];stop[p]=to[p];}
        if(changed.includes('strokeDashoffset')){start.strokeDasharray='1 1';stop.strokeDasharray='1 1';}
        moves.push(el.animate([start,stop],{duration,easing:EASE.out}));
      }
      return Promise.all(moves.map(m=>m.finished)).then(()=>undefined,()=>undefined);
    }};
  signal?.addEventListener('abort',()=>controls.cancel(),{once:true});
  return controls;
}

/** Cards play on a 160ms hover dwell or keyboard focus, one at a time, and settle back on leave.
 *  With autoplay (the template detail) the story plays twice, then stays on the finished frame with a replay button. */
export function bindTemplateStories(root,{autoplay=false,loops=2,signal}={}){
  let current=null,timer=0;
  const stop=()=>{clearTimeout(timer);if(!current)return;const {story,preview}=current;current=null;preview.removeAttribute('data-answer');void story.settle();};
  const start=card=>{const svg=card.querySelector('.map-preview-svg');if(!svg||current?.card===card)return;stop();current={card,preview:svg.closest('.map-template-preview'),story:playTemplateStory(svg)};};
  const events={signal};
  if(autoplay){
    const svg=root.querySelector('.map-preview-svg'),preview=svg?.closest('.map-template-preview');if(!svg)return;
    const replay=document.createElement('button');replay.type='button';replay.className='iq-btn ghost icon sm map-preview-replay';replay.setAttribute('aria-label','Показать ещё раз');replay.hidden=true;
    replay.innerHTML='<svg class="iq-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
    preview.append(replay);
    let run=0,story=null;
    const play=async count=>{const token=++run;replay.hidden=true;
      for(let i=0;i<count&&token===run;i++){story?.cancel();story=playTemplateStory(svg);await story.finished;if(token!==run)return;if(i<count-1)await new Promise(r=>setTimeout(r,600));}
      if(token===run)replay.hidden=motionReduced();};
    replay.addEventListener('click',()=>play(1),events);
    const begin=setTimeout(()=>play(loops),300);
    signal?.addEventListener('abort',()=>{run++;clearTimeout(begin);story?.cancel();},{once:true});
    return;
  }
  root.addEventListener('pointerover',event=>{const card=event.target.closest?.('.map-template-card');if(!card||card.contains(event.relatedTarget)||current?.card===card)return;clearTimeout(timer);timer=setTimeout(()=>start(card),160);},events);
  root.addEventListener('pointerout',event=>{const card=event.target.closest?.('.map-template-card');if(!card||card.contains(event.relatedTarget))return;clearTimeout(timer);if(current?.card===card)stop();},events);
  root.addEventListener('focusin',event=>{const card=event.target.closest?.('.map-template-card');if(card?.matches(':focus-visible'))start(card);},events);
  root.addEventListener('focusout',event=>{const card=event.target.closest?.('.map-template-card');if(card&&current?.card===card&&!card.contains(event.relatedTarget))stop();},events);
  signal?.addEventListener('abort',stop,{once:true});
}
