/** A read-only SVG projection of the real template, never a decorative stock thumbnail.
 *  It reads as a miniature board: dotted canvas, titled areas, coloured notes with text lines instead of
 *  unreadable micro-text, actions with a checkbox, arrows with heads. Hover lifts the objects in sequence and
 *  draws the links (CSS, disabled for reduced motion). */
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tone=o=>['sand','mint','lavender','sky','rose'].includes(o.color)?o.color:'neutral';
const num=n=>Number(n.toFixed(1));
let sequence=0;
const W=360,H=220,PAD=18;
export function previewDocument(document) {
  const objects=(document?.objects||[]).filter(o=>['x','y','width','height'].every(k=>Number.isFinite(o[k])));
  if(!objects.length)return '<div class="map-template-preview empty"><span>Чистая карта</span></div>';
  const id='tp'+(++sequence);
  const x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));
  const width=Math.max(...objects.map(o=>o.x+o.width))-x,height=Math.max(...objects.map(o=>o.y+o.height))-y;
  const scale=Math.min((W-PAD*2)/Math.max(1,width),(H-PAD*2)/Math.max(1,height));
  const dx=(W-width*scale)/2,dy=(H-height*scale)/2;
  const rect=o=>({x:num((o.x-x)*scale+dx),y:num((o.y-y)*scale+dy),w:num(Math.max(4,o.width*scale)),h:num(Math.max(4,o.height*scale))});
  const byId=new Map(objects.map(o=>[o.id,o]));
  // Text is drawn as soft lines: the preview shows structure, the card copy carries the words.
  const lines=(x0,y0,w,count,cls='map-preview-line')=>Array.from({length:count},(_,i)=>`<rect class="${cls}" x="${num(x0)}" y="${num(y0+i*6)}" width="${num(Math.max(6,w*(i===count-1&&count>1?.55:.85)))}" height="3" rx="1.5"/>`).join('');
  const edge=(a,b)=>{
    const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2,horizontal=Math.abs(bx-ax)>=Math.abs(by-ay);
    const [sx,sy,ex,ey]=horizontal?[bx>ax?a.x+a.w:a.x,ay,bx>ax?b.x:b.x+b.w,by]:[ax,by>ay?a.y+a.h:a.y,bx,by>ay?b.y:b.y+b.h];
    const mx=(sx+ex)/2,my=(sy+ey)/2;
    return horizontal?`M${num(sx)} ${num(sy)} C${num(mx)} ${num(sy)} ${num(mx)} ${num(ey)} ${num(ex)} ${num(ey)}`:`M${num(sx)} ${num(sy)} C${num(sx)} ${num(my)} ${num(ex)} ${num(my)} ${num(ex)} ${num(ey)}`;
  };
  const links=(document.connections||[]).map(e=>byId.has(e.from)&&byId.has(e.to)?`<path class="map-preview-link" pathLength="1" marker-end="url(#${id}-arrow)" d="${edge(rect(byId.get(e.from)),rect(byId.get(e.to)))}"/>`:'').join('');
  let order=0;
  const draw=o=>{
    const {x,y,w,h}=rect(o),cx=x+w/2,cy=y+h/2,inner=Math.max(6,w-12);
    const index=o.type==='frame'?0:Math.min(12,++order);
    let body='';
    if(o.type==='frame'){
      const label=String(o.text||'').replace(/[#*\n\r]/g,' ').trim(),limit=Math.max(4,Math.floor((w-14)/5.4));
      body=`<rect class="map-preview-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/><text class="map-preview-title" x="${num(x+8)}" y="${num(y+14)}">${escape(label.length>limit?label.slice(0,limit-1)+'…':label)}</text>`;
    }else if(o.type==='text')body=lines(x,y+2,w,Math.min(3,Math.max(1,Math.round(h/8))),'map-preview-line strong');
    else if(o.type==='task')body=`<rect class="map-preview-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/><rect class="map-preview-check" x="${num(x+5)}" y="${num(y+5)}" width="5" height="5" rx="1.2"/>${lines(x+13,y+6,inner-8,1)}${h>18?lines(x+5,y+15,inner,1):''}`;
    else if(o.type==='image')body=`<rect class="map-preview-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/><path class="map-preview-picture" d="M${num(x+4)} ${num(y+h-4)} L${num(x+w*.4)} ${num(y+h*.45)} L${num(x+w*.62)} ${num(y+h*.7)} L${num(x+w*.75)} ${num(y+h*.58)} L${num(x+w-4)} ${num(y+h-4)}Z"/>`;
    else if(o.type==='shape'&&o.shape==='diamond')body=`<path class="map-preview-shape" d="M${cx} ${y} L${x+w} ${cy} L${cx} ${y+h} L${x} ${cy}Z"/>${lines(cx-w*.2,cy-1.5,w*.4,1)}`;
    else if(o.type==='shape'&&o.shape==='ellipse')body=`<ellipse class="map-preview-shape" cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}"/>${lines(cx-w*.22,cy-1.5,w*.44,1)}`;
    else if(o.type==='shape')body=`<rect class="map-preview-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.shape==='pill'?Math.min(12,h/2):4}"/>${lines(cx-w*.25,cy-1.5,w*.5,1)}`;
    else body=`<rect class="map-preview-shadow" x="${x}" y="${num(y+1.5)}" width="${w}" height="${h}" rx="3"/><rect class="map-preview-note" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>${lines(x+6,y+7,inner,Math.min(3,Math.max(1,Math.floor((h-10)/7))))}`;
    return `<g class="map-preview-node" data-type="${escape(o.type)}" data-tone="${tone(o)}" style="--i:${index}">${body}</g>`;
  };
  return `<div class="map-template-preview" aria-hidden="true"><svg class="map-preview-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="${id}-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle class="map-preview-dot" cx="1" cy="1" r=".9"/></pattern><marker id="${id}-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="map-preview-arrow" d="M0 0 L8 4 L0 8 Z"/></marker></defs><rect class="map-preview-canvas" width="${W}" height="${H}" fill="url(#${id}-dots)"/><g class="map-preview-scene">${objects.filter(o=>o.type==='frame').map(draw).join('')}${links}${objects.filter(o=>o.type!=='frame').map(draw).join('')}</g></svg></div>`;
}
