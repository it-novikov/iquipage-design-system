import dep0 from './whiteboard-shapes.js';
const exports={};
const deps={"./whiteboard-shapes.js":dep0};
(function(exports,require){
'use strict';
/** Bounded orthogonal routing in document coordinates. Never changes stored user data.
 * Direct candidate routes are preferred; visibility-grid search is only used on collision.
 * Long/large scenes route around the nearest 40 relevant obstacles (documented bound).
 */
const {boundary}=require('./whiteboard-shapes.js');
const SIDES=['auto','top','right','bottom','left'];
const NORMALS={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function autoSide(a,b){const dx=(b.x+b.width/2)-(a.x+a.width/2),dy=(b.y+b.height/2)-(a.y+a.height/2);return Math.abs(dx)>=Math.abs(dy)?dx>=0?'right':'left':dy>=0?'bottom':'top';}
function anchor(o,side){const [nx,ny]=NORMALS[side]||NORMALS.right,[fx,fy]=o.type==='shape'?boundary(o.shape,side):boundary('rectangle',side);return{x:o.x+o.width*fx,y:o.y+o.height*fy,nx,ny,side};}
function compact(points){const out=[];for(const p of points){const n=out.length;if(n&&Math.abs(out[n-1].x-p.x)<.01&&Math.abs(out[n-1].y-p.y)<.01)continue;out.push({x:p.x,y:p.y});while(out.length>=3){const [a,b,c]=out.slice(-3);if((a.x===b.x&&b.x===c.x&&(b.y-a.y)*(c.y-b.y)>=0)||(a.y===b.y&&b.y===c.y&&(b.x-a.x)*(c.x-b.x)>=0))out.splice(out.length-2,1);else break;}}return out;}
function rounded(points,r=10){points=compact(points);if(!points.length)return'';let d=`M ${points[0].x} ${points[0].y}`;for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y);if(!l1||!l2)continue;const k=Math.min(r,l1/2,l2/2),p={x:b.x-(b.x-a.x)*k/l1,y:b.y-(b.y-a.y)*k/l1},q={x:b.x+(c.x-b.x)*k/l2,y:b.y+(c.y-b.y)*k/l2};d+=` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;}return d+` L ${points.at(-1).x} ${points.at(-1).y}`;}
function onPolyline(points,t=.5){const ls=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i].x,b.y-points[i].y));let n=ls.reduce((a,b)=>a+b,0)*t;for(let i=0;i<ls.length;i++){if(n<=ls[i]||i===ls.length-1){const f=ls[i]?n/ls[i]:0;return{x:points[i].x+(points[i+1].x-points[i].x)*f,y:points[i].y+(points[i+1].y-points[i].y)*f};}n-=ls[i];}return points[0];}
function box(o,pad=16){return{x:o.x-pad,y:o.y-pad,r:o.x+o.width+pad,b:o.y+o.height+pad};}
function intersects(a,b,r){ // Open rectangle intersection, also handles cubic sampling segments.
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const [p,q] of [[-dx,a.x-r.x],[dx,r.r-a.x],[-dy,a.y-r.y],[dy,r.b-a.y]]){if(Math.abs(p)<1e-9){if(q<=.01)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}}return lo<hi-.000001&&hi>0&&lo<1;
}
function clear(points,obstacles){return points.slice(1).every((p,i)=>!obstacles.some(r=>intersects(points[i],p,r)));}
function length(points){return points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}
function elbowCandidates(p,q,bend=0){return [
 [p,{x:q.x,y:p.y},q],[p,{x:p.x,y:q.y},q],
 [p,{x:(p.x+q.x)/2+bend,y:p.y},{x:(p.x+q.x)/2+bend,y:q.y},q],
 [p,{x:p.x,y:(p.y+q.y)/2+bend},{x:q.x,y:(p.y+q.y)/2+bend},q]
].map(compact);}
function visibilityPath(p,q,obstacles){
 const xs=[...new Set([p.x,q.x,...obstacles.flatMap(r=>[r.x,r.r])])].sort((a,b)=>a-b),ys=[...new Set([p.y,q.y,...obstacles.flatMap(r=>[r.y,r.b])])].sort((a,b)=>a-b);
 const nx=xs.length,ny=ys.length;const index=(x,y)=>y*nx+x;const valid=new Uint8Array(nx*ny);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)valid[index(x,y)]=!obstacles.some(r=>xs[x]>r.x+.01&&xs[x]<r.r-.01&&ys[y]>r.y+.01&&ys[y]<r.b-.01);
 const start=index(xs.indexOf(p.x),ys.indexOf(p.y)),end=index(xs.indexOf(q.x),ys.indexOf(q.y));
 const dist=new Map(),prev=new Map(),queue=[];const startKey=start*3;dist.set(startKey,0);queue.push([0,startKey]);
 function push(v){queue.push(v);let i=queue.length-1;while(i){const j=(i-1)>>1;if(queue[j][0]<=v[0])break;queue[i]=queue[j];i=j;}queue[i]=v;}
 function pop(){const v=queue[0],last=queue.pop();if(queue.length){let i=0;queue[0]=last;while(2*i+1<queue.length){let j=i*2+1;if(j+1<queue.length&&queue[j+1][0]<queue[j][0])j++;if(queue[i][0]<=queue[j][0])break;[queue[i],queue[j]]=[queue[j],queue[i]];i=j;}}return v;}
 let found=null,iterations=0;
 while(queue.length&&iterations++<30000){const[cost,key]=pop();if(cost!==dist.get(key))continue;const cur=Math.floor(key/3),axis=key%3;if(cur===end){found=key;break;}const x=cur%nx,y=Math.floor(cur/nx),a={x:xs[x],y:ys[y]};
 for(const [xx,yy,dir]of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]){if(xx<0||xx>=nx||yy<0||yy>=ny)continue;const ni=index(xx,yy);if(!valid[ni])continue;const b={x:xs[xx],y:ys[yy]};if(!clear([a,b],obstacles))continue;const k=ni*3+dir,d=cost+Math.abs(b.x-a.x)+Math.abs(b.y-a.y)+(axis&&axis!==dir?24:0);if(d<(dist.get(k)??Infinity)){dist.set(k,d);prev.set(k,key);push([d,k]);}}
 }
 if(found===null)return null;const path=[];for(let k=found;k!=null;k=prev.get(k)){const i=Math.floor(k/3);path.push({x:xs[i%nx],y:ys[Math.floor(i/nx)]});}return compact(path.reverse());
}
function route(a,b,edge={},objects=[]){
 if(typeof edge==='string')edge={style:edge};
 const fs=SIDES.includes(edge.fromPort)&&edge.fromPort!=='auto'?edge.fromPort:autoSide(a,b),ts=SIDES.includes(edge.toPort)&&edge.toPort!=='auto'?edge.toPort:autoSide(b,a),s=anchor(a,fs),t=anchor(b,ts);
 const style=edge.style||'elbow',pos=clamp(edge.labelPosition??.5,.15,.85),bend=Number.isFinite(edge.bend)?clamp(edge.bend,-500,500):0;
 if(style==='straight'){const points=[s,t],p=onPolyline(points,pos);return{path:rounded(points,0),x:p.x,y:p.y,source:s,target:t,points,avoided:false};}
 const span=Math.hypot(t.x-s.x,t.y-s.y),stem=Math.min(28,Math.max(12,span/4));const escape=(o,k)=>({x:k.nx<0?Math.min(k.x-stem,o.x-20):k.nx>0?Math.max(k.x+stem,o.x+o.width+20):k.x,y:k.ny<0?Math.min(k.y-stem,o.y-20):k.ny>0?Math.max(k.y+stem,o.y+o.height+20):k.y});const p=escape(a,s),q=escape(b,t);
 const corridor={x:Math.min(a.x,b.x)-240,y:Math.min(a.y,b.y)-240,r:Math.max(a.x+a.width,b.x+b.width)+240,b:Math.max(a.y+a.height,b.y+b.height)+240};
 const others=objects.filter(o=>o.id!==a.id&&o.id!==b.id&&!['frame','drawing','text'].includes(o.type)&&o.x<corridor.r&&o.x+o.width>corridor.x&&o.y<corridor.b&&o.y+o.height>corridor.y).sort((c,d)=>Math.hypot(c.x-(p.x+q.x)/2,c.y-(p.y+q.y)/2)-Math.hypot(d.x-(p.x+q.x)/2,d.y-(p.y+q.y)/2)).slice(0,40);
 const obstacles=[box(a,8),box(b,8),...others.map(o=>box(o,18))];
 if(style==='curve'){
  const k=Math.min(180,Math.max(40,span*.4));const c1={x:s.x+s.nx*k,y:s.y+s.ny*k},c2={x:t.x+t.nx*k,y:t.y+t.ny*k};if(s.nx||t.nx){c1.y+=bend;c2.y+=bend;}else{c1.x+=bend;c2.x+=bend;}
  const bez=v=>{const u=1-v;return{x:u*u*u*s.x+3*u*u*v*c1.x+3*u*v*v*c2.x+v*v*v*t.x,y:u*u*u*s.y+3*u*u*v*c1.y+3*u*v*v*c2.y+v*v*v*t.y};};
  const samples=Array.from({length:29},(_,i)=>bez((i+1)/30));if(clear(samples,[box(a,-1),box(b,-1),...others.map(o=>box(o,10))])){const l=bez(pos);return{path:`M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${t.x} ${t.y}`,x:l.x,y:l.y,source:s,target:t,points:[s,c1,c2,t],avoided:false};}
 }
 let candidates=elbowCandidates(p,q,bend).filter(v=>clear(v,obstacles));candidates.sort((u,v)=>length(u)+u.length*20-length(v)-v.length*20);let middle=candidates[0],avoided=false;
 if(!middle){middle=visibilityPath(p,q,obstacles);avoided=!!middle;}
 if(!middle){const y=Math.max(...obstacles.map(o=>o.b))+32;middle=[p,{x:p.x,y},{x:q.x,y},q];}
 let points=compact([s,...middle,t]);let label=onPolyline(points,pos);
 // Keep the label away from nodes: use the longest valid segment when the midpoint is occluded.
 if(objects.some(o=>!['frame','drawing'].includes(o.type)&&label.x>o.x-20&&label.x<o.x+o.width+20&&label.y>o.y-16&&label.y<o.y+o.height+16)){
 const segments=points.slice(1).map((n,i)=>({a:points[i],b:n,len:Math.hypot(n.x-points[i].x,n.y-points[i].y)})).sort((a,b)=>b.len-a.len);for(const seg of segments){const l=onPolyline([seg.a,seg.b],.5);if(!obstacles.some(r=>l.x>r.x&&l.x<r.r&&l.y>r.y&&l.y<r.b)){label=l;break;}}
 }
 return{path:rounded(points,style==='curve'?22:10),x:label.x,y:label.y,source:s,target:t,points,avoided};
}
Object.assign(exports,{SIDES,autoSide,anchor,route,rounded,onPolyline,intersects,clear});

})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
