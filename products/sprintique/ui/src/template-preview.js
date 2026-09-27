/** A read-only SVG projection of the real template, never a decorative stock thumbnail.
 *  It reads as a miniature board: dotted canvas, titled areas, coloured notes with text lines instead of
 *  unreadable micro-text, actions with a checkbox, arrows with heads. At rest it shows the finished template;
 *  template-story.js replays how it gets filled in, from the roles and order written here as data attributes.
 *
 *  Geometry rules: the viewBox has the container's aspect, content keeps a safe inset on every side (plus a reserve
 *  for the camera push-in), links are routed orthogonally around other objects and never pass under them, and
 *  arrowheads are drawn above nodes with a small gap before the target's border. */
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tone=o=>['sand','mint','lavender','sky','rose'].includes(o.color)?o.color:'neutral';
const num=n=>Number(n.toFixed(2));
let sequence=0;
export const PREVIEW_VARIANTS={card:{W:360,H:200,inset:20,reserve:6},detail:{W:360,H:240,inset:24,reserve:8}};
const INFLATE=16,TITLE_BAND=56,MAX_SCALE=.34,HEAD_GAP=2.5,HEAD_BACK=5.5,CORNER=6;
const box=o=>({x:o.x,y:o.y,w:o.width,h:o.height});
const centre=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
const inside=(p,r)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
/** Axis-aligned segment against a rectangle's open interior. */
const hits=(a,b,r)=>Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h;
const SIDES={right:{x:1,y:0},left:{x:-1,y:0},bottom:{x:0,y:1},top:{x:0,y:-1}};

/** Reading order: frames by 40-unit rows then x; nodes by their frame, then y, then x; free nodes by link rank. */
export function readingOrder(objects,connections=[]){
  const frames=objects.filter(o=>o.type==='frame').sort((a,b)=>Math.round(a.y/40)-Math.round(b.y/40)||a.x-b.x);
  const frameIndex=new Map(frames.map((f,i)=>[f.id,i]));
  const rank=new Map(),nodes=objects.filter(o=>o.type!=='frame');
  const incoming=new Map(nodes.map(o=>[o.id,0]));for(const c of connections)if(incoming.has(c.to))incoming.set(c.to,incoming.get(c.to)+1);
  let layer=nodes.filter(o=>!incoming.get(o.id)).map(o=>o.id),depth=0;const seen=new Set();
  while(layer.length&&depth<50){const next=[];for(const id of layer){if(seen.has(id))continue;seen.add(id);rank.set(id,depth);for(const c of connections)if(c.from===id&&!seen.has(c.to))next.push(c.to);}layer=next;depth++;}
  const frameOf=o=>{let p=o;const guard=new Set();while(p?.parentId&&!guard.has(p.id)){guard.add(p.id);if(frameIndex.has(p.parentId))return frameIndex.get(p.parentId);p=objects.find(x=>x.id===p.parentId);}
    const f=frames.findIndex(fr=>inside(centre(box(o)),box(fr)));return f<0?frames.length:f;};
  const sorted=nodes.map(o=>({o,f:frameOf(o)})).sort((a,b)=>a.f-b.f||(a.f===frames.length&&connections.length?(rank.get(a.o.id)??99)-(rank.get(b.o.id)??99):0)||Math.round(a.o.y/40)-Math.round(b.o.y/40)||a.o.x-b.o.x);
  return {frames,nodes:sorted.map(x=>x.o),frameOf:new Map(sorted.map(x=>[x.o.id,x.f])),rank};
}

/** The object a template leads to: the last action, else the most linked-into node, else the hub. */
export function outcomeOf(nodes,connections){
  const tasks=nodes.filter(o=>o.type==='task');if(tasks.length)return tasks.at(-1);
  if(!connections.length)return null;
  const inDeg=new Map(),deg=new Map();for(const c of connections){inDeg.set(c.to,(inDeg.get(c.to)||0)+1);deg.set(c.to,(deg.get(c.to)||0)+1);deg.set(c.from,(deg.get(c.from)||0)+1);}
  const best=(map)=>nodes.reduce((a,o)=>(map.get(o.id)||0)>(map.get(a?.id)||0)?o:a,null);
  const hub=best(deg);if((deg.get(hub?.id)||0)>=3&&(inDeg.get(hub.id)||0)<(deg.get(hub.id)||0))return hub;
  return best(inDeg)||hub;
}

/** Story archetype, derived from structure so saved templates get a fitting story too. */
export function storyOf(document){
  const objects=document?.objects||[],links=document?.connections||[],frames=objects.filter(o=>o.type==='frame');
  if(!links.length){
    if(frames.length>=2&&frames.every(f=>Math.abs(f.x-frames[0].x)<40))return 'rows';
    return 'columns';
  }
  const deg=new Map();for(const c of links){deg.set(c.from,(deg.get(c.from)||0)+1);deg.set(c.to,(deg.get(c.to)||0)+1);}
  if(objects.some(o=>o.type==='shape'&&o.shape==='diamond'))return 'flow';
  const maxDeg=Math.max(...deg.values()),inDeg=new Map();for(const c of links)inDeg.set(c.to,(inDeg.get(c.to)||0)+1);
  if(maxDeg>=3&&Math.max(...inDeg.values())<maxDeg)return 'structure';
  if(Math.max(...inDeg.values())>=2)return 'converge';
  return 'flow';
}

/** Orthogonal routes around objects, in document units. Returns [{id,from,to,points,over}]. */
export function routeLinks(objects,connections,{stub=24}={}){
  const byId=new Map(objects.map(o=>[o.id,o])),frames=objects.filter(o=>o.type==='frame');
  const valid=connections.filter(c=>byId.has(c.from)&&byId.has(c.to)&&c.from!==c.to);
  const plan=valid.map(c=>{
    const a=box(byId.get(c.from)),b=box(byId.get(c.to)),ca=centre(a),cb=centre(b),horizontal=Math.abs(cb.x-ca.x)>=Math.abs(cb.y-ca.y);
    return {c,a,b,from:horizontal?(cb.x>=ca.x?'right':'left'):(cb.y>=ca.y?'bottom':'top'),to:horizontal?(cb.x>=ca.x?'left':'right'):(cb.y>=ca.y?'top':'bottom')};
  });
  // Links sharing one side of a node spread along it, ordered by where their other end is, so they never cross.
  const slots=new Map();
  const slot=(id,side,link,other)=>{const key=id+':'+side;if(!slots.has(key))slots.set(key,[]);slots.get(key).push({link,other});};
  for(const p of plan){slot(p.c.from,p.from,p,centre(p.b));slot(p.c.to,p.to,p,centre(p.a));}
  const port=(r,side,key,link)=>{
    const list=slots.get(key);list.sort((m,n)=>side==='left'||side==='right'?m.other.y-n.other.y:m.other.x-n.other.x);
    const k=list.findIndex(item=>item.link===link)+1,f=k/(list.length+1);
    return side==='right'?{x:r.x+r.w,y:r.y+r.h*f}:side==='left'?{x:r.x,y:r.y+r.h*f}:side==='bottom'?{x:r.x+r.w*f,y:r.y+r.h}:{x:r.x+r.w*f,y:r.y};
  };
  return plan.map(p=>{
    const S=port(p.a,p.from,p.c.from+':'+p.from,p),T=port(p.b,p.to,p.c.to+':'+p.to,p),sd=SIDES[p.from],td=SIDES[p.to];
    const obstacles=objects.filter(o=>o.id!==p.c.from&&o.id!==p.c.to&&o.type!=='frame').map(o=>({x:o.x-INFLATE,y:o.y-INFLATE,w:o.width+2*INFLATE,h:o.height+2*INFLATE}));
    // Title bands of other frames are obstacles; a link may cross the band of the frame it enters or leaves.
    for(const f of frames)if(!inside(centre(p.a),box(f))&&!inside(centre(p.b),box(f)))obstacles.push({x:f.x,y:f.y,w:f.width,h:Math.min(TITLE_BAND,f.height)});
    const S1={x:S.x+sd.x*stub,y:S.y+sd.y*stub},T1={x:T.x+td.x*stub,y:T.y+td.y*stub},horizontal=!!sd.x;
    const candidates=[];
    const along=horizontal?'x':'y',across=horizontal?'y':'x';
    if(Math.abs(S[across]-T[across])<=8){const t={...T};t[across]=S[across];const span=horizontal?[p.b.y,p.b.y+p.b.h]:[p.b.x,p.b.x+p.b.w];if(t[across]>span[0]+4&&t[across]<span[1]-4)candidates.push([S,t]);}
    const forward=(T1[along]-S1[along])*(sd[along])>=0;
    const mids=new Set([(S1[along]+T1[along])/2]);
    for(const o of obstacles){mids.add(o[along]-20);mids.add(o[along]+o[horizontal?'w':'h']+20);}
    if(forward)for(const m of mids){
      const lo=Math.min(S1[along],T1[along]),hi=Math.max(S1[along],T1[along]);if(m<lo||m>hi)continue;
      const a={...S},b={...T};a[along]=m;b[along]=m;candidates.push([S,a,b,T]);
    }
    const lanes=new Set();
    for(const o of obstacles){lanes.add(o[across]-24);lanes.add(o[across]+o[horizontal?'h':'w']+24);}
    for(const r of [p.a,p.b]){lanes.add(r[across]-24);lanes.add(r[across]+r[horizontal?'h':'w']+24);}
    // The source stub may be short (it only carries the origin dot); the target stub keeps room for the head.
    for(const length of new Set([stub,24,12]))for(const c of lanes){
      const s1={x:S.x+sd.x*length,y:S.y+sd.y*length},a={...s1},b={...T1};a[across]=c;b[across]=c;candidates.push([S,s1,a,b,T1,T]);
    }
    const segments=pts=>pts.slice(1).map((q,i)=>[pts[i],q]);
    const cost=pts=>{
      let length=0,crossings=0;
      for(const [u,v] of segments(pts)){length+=Math.abs(u.x-v.x)+Math.abs(u.y-v.y);for(const f of frames)if(inside(u,box(f))!==inside(v,box(f)))crossings++;}
      return length+120*(pts.length-2)+400*crossings;
    };
    const clear=pts=>segments(pts).every(([u,v])=>!obstacles.some(o=>hits(u,v,o)))&&segments(pts).slice(1,-1).every(([u,v])=>!hits(u,v,p.a)&&!hits(u,v,p.b));
    const scored=candidates.map(pts=>({pts:pts.filter((q,i)=>i===0||q.x!==pts[i-1].x||q.y!==pts[i-1].y),cost:cost(pts)})).sort((m,n)=>m.cost-n.cost);
    const best=scored.find(item=>clear(item.pts))||scored[0];
    return {id:p.c.id,from:p.c.from,to:p.c.to,points:best.pts,over:!clear(best.pts)};
  });
}

function roundedPath(points){
  if(points.length<3)return `M${num(points[0].x)} ${num(points[0].y)} L${num(points[1].x)} ${num(points[1].y)}`;
  let d=`M${num(points[0].x)} ${num(points[0].y)}`;
  for(let i=1;i<points.length-1;i++){
    const p=points[i],a=points[i-1],b=points[i+1],la=Math.hypot(p.x-a.x,p.y-a.y),lb=Math.hypot(b.x-p.x,b.y-p.y),r=Math.min(CORNER,la/2,lb/2);
    const u={x:(p.x-a.x)/(la||1),y:(p.y-a.y)/(la||1)},v={x:(b.x-p.x)/(lb||1),y:(b.y-p.y)/(lb||1)};
    d+=` L${num(p.x-u.x*r)} ${num(p.y-u.y*r)} Q${num(p.x)} ${num(p.y)} ${num(p.x+v.x*r)} ${num(p.y+v.y*r)}`;
  }
  const last=points.at(-1);return d+` L${num(last.x)} ${num(last.y)}`;
}

export function previewDocument(document,{variant='card',story}={}) {
  const {W,H,inset,reserve}=PREVIEW_VARIANTS[variant]||PREVIEW_VARIANTS.card;
  const objects=(document?.objects||[]).filter(o=>['x','y','width','height'].every(k=>Number.isFinite(o[k])));
  if(!objects.length)return '<div class="map-template-preview empty"><span>Чистая карта</span></div>';
  const id='tp'+(++sequence),connections=(document.connections||[]).filter(c=>c&&c.from&&c.to);
  const bounds=list=>{const x=Math.min(...list.map(r=>r.x)),y=Math.min(...list.map(r=>r.y));return {x,y,w:Math.max(...list.map(r=>r.x+r.w))-x,h:Math.max(...list.map(r=>r.y+r.h))-y};};
  const fit=b=>Math.min((W-2*(inset+reserve))/Math.max(1,b.w),(H-2*(inset+reserve))/Math.max(1,b.h),MAX_SCALE);
  // Two passes: the stub must be long enough on screen for a head, and routes may leave the objects' box.
  const first=fit(bounds(objects.map(box)));
  const routes=routeLinks(objects,connections,{stub:Math.max(24,16/first)});
  const all=bounds([...objects.map(box),...routes.flatMap(r=>r.points.map(q=>({x:q.x,y:q.y,w:0,h:0})))]);
  const scale=fit(all),bleed=2/scale,b={x:all.x-bleed,y:all.y-bleed,w:all.w+2*bleed,h:all.h+2*bleed},s=fit(b);
  const dx=(W-b.w*s)/2-b.x*s,dy=(H-b.h*s)/2-b.y*s;
  const P=q=>({x:q.x*s+dx,y:q.y*s+dy});
  const rect=o=>({x:num(o.x*s+dx),y:num(o.y*s+dy),w:num(Math.max(4,o.width*s)),h:num(Math.max(4,o.height*s))});
  const {frames,nodes,frameOf,rank}=readingOrder(objects,connections);
  const outcome=outcomeOf(nodes,connections),archetype=story||storyOf(document);
  const lines=(x0,y0,w,count,cls='map-preview-line')=>Array.from({length:count},(_,i)=>`<rect class="${cls}" x="${num(x0)}" y="${num(y0+i*6)}" width="${num(Math.max(6,w*(i===count-1&&count>1?.55:.85)))}" height="3" rx="1.5"/>`).join('');
  const role=o=>o.type==='sticky'?'input':o.type==='shape'&&o.shape==='diamond'?'decision':'step';
  const frameMarkup=(o,k)=>{
    const {x,y,w,h}=rect(o),label=String(o.text||'').replace(/[#*\n\r]/g,' ').trim(),limit=Math.max(4,Math.floor((w-14)/5.6));
    return `<g class="map-preview-stage" data-role="stage" data-order="${k}"><rect class="map-preview-frame" pathLength="1" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/><text class="map-preview-title" x="${num(x+8)}" y="${num(y+14)}">${escape(label.length>limit?label.slice(0,limit-1)+'…':label)}</text></g>`;
  };
  const nodeMarkup=(o,k)=>{
    const {x,y,w,h}=rect(o),cx=x+w/2,cy=y+h/2,inner=Math.max(6,w-12);
    let body='';
    if(o.type==='text')body=lines(x,y+2,w,Math.min(3,Math.max(1,Math.round(h/8))),'map-preview-line strong');
    else if(o.type==='task')body=`<rect class="map-preview-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/><rect class="map-preview-check" x="${num(x+5)}" y="${num(y+5)}" width="5" height="5" rx="1.2"/>${lines(x+13,y+6,inner-8,1)}${h>18?lines(x+5,y+15,inner,1):''}`;
    else if(o.type==='image')body=`<rect class="map-preview-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/><path class="map-preview-picture" d="M${num(x+4)} ${num(y+h-4)} L${num(x+w*.4)} ${num(y+h*.45)} L${num(x+w*.62)} ${num(y+h*.7)} L${num(x+w*.75)} ${num(y+h*.58)} L${num(x+w-4)} ${num(y+h-4)}Z"/>`;
    else if(o.type==='shape'&&o.shape==='diamond')body=`<path class="map-preview-shape" d="M${num(cx)} ${y} L${num(x+w)} ${num(cy)} L${num(cx)} ${num(y+h)} L${x} ${num(cy)}Z"/>${lines(cx-w*.2,cy-1.5,w*.4,1)}`;
    else if(o.type==='shape'&&o.shape==='ellipse')body=`<ellipse class="map-preview-shape" cx="${num(cx)}" cy="${num(cy)}" rx="${num(w/2)}" ry="${num(h/2)}"/>${lines(cx-w*.22,cy-1.5,w*.44,1)}`;
    else if(o.type==='shape'&&o.shape==='database'){const ry=Math.min(5,h*.14);body=`<path class="map-preview-shape" d="M${x} ${num(y+ry)} A${num(w/2)} ${num(ry)} 0 0 1 ${num(x+w)} ${num(y+ry)} V${num(y+h-ry)} A${num(w/2)} ${num(ry)} 0 0 1 ${x} ${num(y+h-ry)}Z"/><path class="map-preview-shape-line" d="M${x} ${num(y+ry)} A${num(w/2)} ${num(ry)} 0 0 0 ${num(x+w)} ${num(y+ry)}"/>${lines(cx-w*.25,cy,w*.5,1)}`;}
    else if(o.type==='shape'&&o.shape==='manual')body=`<path class="map-preview-shape" d="M${num(x+w*.12)} ${y} L${num(x+w)} ${y} L${num(x+w)} ${num(y+h)} L${x} ${num(y+h)}Z"/>${lines(cx-w*.22,cy-1.5,w*.44,1)}`;
    else if(o.type==='shape')body=`<rect class="map-preview-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.shape==='pill'?num(Math.min(12,h/2)):4}"/>${lines(cx-w*.25,cy-1.5,w*.5,1)}`;
    else body=`<rect class="map-preview-shadow" x="${x}" y="${num(y+1.5)}" width="${w}" height="${h}" rx="3"/><rect class="map-preview-note" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>${lines(x+6,y+7,inner,Math.min(3,Math.max(1,Math.floor((h-10)/7))))}`;
    return `<g class="map-preview-node" data-node="${escape(o.id)}" data-role="${o===outcome?'outcome':role(o)}" data-order="${k}" data-frame="${frameOf.get(o.id)}" data-rank="${rank.get(o.id)??''}" data-type="${escape(o.type)}" data-tone="${tone(o)}">${body}</g>`;
  };
  // Links: halo, line, origin dot below the nodes; the head above them, 2.5 units before the target border.
  const parents=new Map(objects.map(o=>[o.id,frameOf.get(o.id)]));
  const linkParts=routes.map((route,j)=>{
    const pts=route.points.map(P),tip0=pts.at(-1),prev=pts.at(-2),len=Math.hypot(tip0.x-prev.x,tip0.y-prev.y)||1,dir={x:(tip0.x-prev.x)/len,y:(tip0.y-prev.y)/len};
    const tip={x:tip0.x-dir.x*HEAD_GAP,y:tip0.y-dir.y*HEAD_GAP},end={x:tip.x-dir.x*HEAD_BACK,y:tip.y-dir.y*HEAD_BACK};
    const d=roundedPath([...pts.slice(0,-1),end]),angle=num(Math.atan2(dir.y,dir.x)*180/Math.PI),sameFrame=parents.get(route.from)===parents.get(route.to)&&parents.get(route.from)<frames.length;
    const data=`data-link="${j}" data-from="${escape(route.from)}" data-to="${escape(route.to)}"`;
    return {over:route.over,
      below:`<path class="map-preview-halo"${sameFrame?' data-in-frame':''} ${data} d="${d}"/><path class="map-preview-link" pathLength="1" ${data} d="${d}"/><circle class="map-preview-origin" ${data} cx="${num(pts[0].x)}" cy="${num(pts[0].y)}" r="2.2"/>`,
      head:`<g class="map-preview-head" ${data} transform="translate(${num(tip.x)} ${num(tip.y)}) rotate(${angle})"><path d="M0 0 L-7.5 -3.4 L-5.8 0 L-7.5 3.4 Z"/></g>`};
  });
  let overlay='';
  if(outcome){
    const {x,y,w,h}=rect(outcome);
    overlay=`<rect class="map-preview-ring" x="${num(x-3)}" y="${num(y-3)}" width="${num(w+6)}" height="${num(h+6)}" rx="6"/>${outcome.type==='task'?`<g class="map-preview-done" transform="translate(${num(x+5)} ${num(y+5)})"><rect class="map-preview-done-box" width="5" height="5" rx="1.2"/><path class="map-preview-done-mark" pathLength="1" d="M1 2.6 L2.2 3.8 L4.2 1.4"/></g>`:''}`;
  }
  // Camera: the establishing shot pulls back to the content centre; the push-in closes on the outcome and is
  // clamped so the scaled content never leaves the safe area (inset minus reserve).
  const content={x:b.x*s+dx,y:b.y*s+dy,w:b.w*s,h:b.h*s},focus=outcome?centre(rect(outcome)):centre(content),limit=inset-reserve;
  let push=archetype==='rows'||!outcome?1:1.035;
  if(focus.x>content.x)push=Math.min(push,(focus.x-limit)/(focus.x-content.x));
  if(content.x+content.w>focus.x)push=Math.min(push,(W-limit-focus.x)/(content.x+content.w-focus.x));
  if(focus.y>content.y)push=Math.min(push,(focus.y-limit)/(focus.y-content.y));
  if(content.y+content.h>focus.y)push=Math.min(push,(H-limit-focus.y)/(content.y+content.h-focus.y));
  const pct=(v,t)=>num(v/t*100)+'%';
  return `<div class="map-template-preview" data-variant="${variant}" aria-hidden="true"><svg class="map-preview-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" data-story="${escape(archetype)}" data-push="${num(Math.max(1,push))}" data-focus="${pct(focus.x,W)} ${pct(focus.y,H)}" data-centre="${pct(content.x+content.w/2,W)} ${pct(content.y+content.h/2,H)}"><defs><pattern id="${id}-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle class="map-preview-dot" cx="1" cy="1" r=".9"/></pattern></defs><rect class="map-preview-canvas" width="${W}" height="${H}" fill="url(#${id}-dots)"/><g class="map-preview-frames">${frames.map(frameMarkup).join('')}</g><g class="map-preview-links">${linkParts.filter(l=>!l.over).map(l=>l.below).join('')}</g><g class="map-preview-nodes">${nodes.map(nodeMarkup).join('')}</g><g class="map-preview-heads">${linkParts.filter(l=>!l.over).map(l=>l.head).join('')}</g><g class="map-preview-over">${linkParts.filter(l=>l.over).map(l=>l.below+l.head).join('')}</g><g class="map-preview-overlay">${overlay}</g></svg></div>`;
}
