/** A read-only SVG projection of the real template, never a decorative stock thumbnail. */
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tone=o=>['sand','mint','lavender','sky','rose'].includes(o.color)?o.color:'neutral';
const num=n=>Number(n.toFixed(2));
export function previewDocument(document) {
  const objects=(document?.objects||[]).filter(o=>['x','y','width','height'].every(k=>Number.isFinite(o[k])));
  if(!objects.length)return '<div class="map-template-preview empty">Чистая карта</div>';
  const x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));
  const width=Math.max(...objects.map(o=>o.x+o.width))-x,height=Math.max(...objects.map(o=>o.y+o.height))-y;
  const scale=Math.min(324/Math.max(1,width),158/Math.max(1,height));
  const dx=(360-width*scale)/2,dy=(190-height*scale)/2;
  const rect=o=>({x:num((o.x-x)*scale+dx),y:num((o.y-y)*scale+dy),w:num(o.width*scale),h:num(o.height*scale)});
  const byId=new Map(objects.map(o=>[o.id,o]));
  const links=(document.connections||[]).map(e=>{
    if(!byId.has(e.from)||!byId.has(e.to))return '';
    const a=rect(byId.get(e.from)),b=rect(byId.get(e.to));
    const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
    return `<path class="map-preview-link" d="M${num(ax)} ${num(ay)} L${num(bx)} ${num(by)}"/>`;
  }).join('');
  const draw=o=>{
    const {x,y,w,h}=rect(o),cx=x+w/2,cy=y+h/2;
    let shape='';
    if(o.type==='text')shape='';
    else if(o.type==='shape'&&o.shape==='diamond')shape=`<path d="M${cx} ${y} L${x+w} ${cy} L${cx} ${y+h} L${x} ${cy}Z"/>`;
    else if(o.type==='shape'&&o.shape==='ellipse')shape=`<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}"/>`;
    else if(o.type==='shape'&&o.shape==='database')shape=`<path d="M${x} ${y+5} Q${cx} ${y-5} ${x+w} ${y+5} V${y+h-5} Q${cx} ${y+h+5} ${x} ${y+h-5}Z M${x} ${y+5} Q${cx} ${y+15} ${x+w} ${y+5}"/>`;
    else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.shape==='pill'?Math.min(12,h/2):o.type==='sticky'?2:4}"/>`;
    const isFrame=o.type==='frame';
    const label=String(o.text||'').replace(/[#*\n\r]/g,' ').trim();
    const limit=Math.max(5,Math.floor(w/(isFrame?4.3:4)));
    const cut=label.length>limit?label.slice(0,Math.max(3,limit-1))+'…':label;
    const labelY=isFrame?y+12:o.type==='text'?y+10:cy+3;
    return `<g class="map-preview-node" data-type="${escape(o.type)}" data-tone="${tone(o)}">${shape}${isFrame?`<path class="map-preview-frame-rule" d="M${x+5} ${y+19} H${x+w-5}"/>`:''}${o.type==='task'?`<rect class="map-preview-check" x="${x+5}" y="${y+5}" width="5" height="5" rx="1"/>`:''}<text x="${isFrame?x+6:cx}" y="${labelY}" text-anchor="${isFrame?'start':'middle'}">${escape(o.type==='image'?'Изображение':cut)}</text></g>`;
  };
  return `<div class="map-template-preview" aria-hidden="true"><svg class="map-preview-svg" viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg">${objects.filter(o=>o.type==='frame').map(draw).join('')}${links}${objects.filter(o=>o.type!=='frame').map(draw).join('')}</svg></div>`;
}
