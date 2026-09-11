/** Ordered packing: a second row only when exactly one tag fits the first. */
export function packTags(widths,available,gap,moreWidth){
  if(!widths.length)return {visible:0,rows:1};
  let first=0,used=0;for(const width of widths){if(first&&used+gap+width>available+.5)break;used+=width+(first?gap:0);first++;}
  const rows=first===1&&widths.length>1?2:1;
  for(let count=widths.length;count>=0;count--){
    const cells=widths.slice(0,count);if(count<widths.length)cells.push(moreWidth(widths.length-count));
    let row=1,x=0;for(const width of cells){if(x&&x+gap+width>available+.5){row++;x=0;}x+=(x?gap:0)+Math.min(width,available);}
    if(row<=rows)return {visible:count,rows};
  }
  return {visible:0,rows};
}
export function mountTagPacking(root){
  let frame=0,closed=false;
  function draw(){frame=0;if(closed)return;for(const line of root.querySelectorAll('[data-card-tags]')){
    const tags=[...line.querySelectorAll('[data-packed-tag]')],more=line.querySelector('[data-tags-overflow]'),available=line.clientWidth;if(!available)continue;
    const gap=parseFloat(getComputedStyle(line).gap)||4;
    more.hidden=false;more.textContent='+'+tags.length;const reserved=more.getBoundingClientRect().width;
    tags.forEach(tag=>{tag.hidden=false;tag.style.maxWidth=Math.max(1,available-(tags.length>1?reserved+gap:0))+'px';});
    const widths=tags.map(tag=>tag.getBoundingClientRect().width),result=packTags(widths,available,gap,n=>{more.textContent='+'+n;return more.getBoundingClientRect().width;});
    tags.forEach((tag,i)=>tag.hidden=i>=result.visible);const hidden=tags.length-result.visible;more.hidden=!hidden;more.textContent='+'+hidden;more.setAttribute('aria-label',`Ещё ${hidden} тегов`);line.dataset.tagRows=String(result.rows);
  }}
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
  const observer=new ResizeObserver(schedule);root.querySelectorAll('[data-card-tags]').forEach(line=>observer.observe(line));document.fonts?.ready.then(schedule);schedule();
  return ()=>{closed=true;observer.disconnect();cancelAnimationFrame(frame);};
}
