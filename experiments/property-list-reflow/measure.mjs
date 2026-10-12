// Serialized into the page by Playwright. Passive DOM/Canvas measurements only; no styles, focus or scroll changes.
export function measureBaseline(){
  const rect=value=>value?{left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height}:null;
  const box=node=>node?rect(node.getBoundingClientRect()):null;
  const describe=node=>node?{tag:node.tagName,id:node.id||null,className:typeof node.className==='string'?node.className:null}:null;
  const styleKeys=['display','position','gridTemplateColumns','columnGap','rowGap','alignItems','width','height','minWidth','maxWidth','minHeight','maxHeight',
    'paddingLeft','paddingRight','paddingTop','paddingBottom','overflowX','overflowY','whiteSpace','textOverflow','lineHeight','fontSize','fontFamily',
    'fontWeight','fontStretch','fontStyle','fontOpticalSizing','letterSpacing','direction','textAlign','clipPath'];
  const styles=node=>{const s=getComputedStyle(node);return Object.fromEntries(styleKeys.map(key=>[key,s[key]]));};
  const intersect=(a,b)=>{const left=Math.max(a.left,b.left),right=Math.min(a.right,b.right),top=Math.max(a.top,b.top),bottom=Math.min(a.bottom,b.bottom);
    return right>left&&bottom>top?{left,right,top,bottom,width:right-left,height:bottom-top}:null;};
  const union=list=>{if(!list.length)return null;const left=Math.min(...list.map(r=>r.left)),right=Math.max(...list.map(r=>r.right)),
    top=Math.min(...list.map(r=>r.top)),bottom=Math.max(...list.map(r=>r.bottom));return {left,right,top,bottom,width:right-left,height:bottom-top};};
  const clipping=node=>{
    const result=[];
    for(let current=node;current;current=current.parentElement){
      const s=getComputedStyle(current),x=/^(hidden|clip|auto|scroll)$/.test(s.overflowX),y=/^(hidden|clip|auto|scroll)$/.test(s.overflowY);
      if(!x&&!y&&s.clipPath==='none')continue;
      const r=box(current),port={left:r.left+current.clientLeft,top:r.top+current.clientTop,
        right:r.left+current.clientLeft+current.clientWidth,bottom:r.top+current.clientTop+current.clientHeight};
      result.push({node:describe(current),x,y,overflowX:s.overflowX,overflowY:s.overflowY,clipPath:s.clipPath,rect:r,port,
        scrollLeft:current.scrollLeft,scrollTop:current.scrollTop,clientWidth:current.clientWidth,scrollWidth:current.scrollWidth,
        clientHeight:current.clientHeight,scrollHeight:current.scrollHeight,documentScroller:current===document.scrollingElement});
    }
    return result;
  };
  const clipped=(source,clips)=>{
    let value={...source};
    for(const clip of clips){
      if(clip.x){value.left=Math.max(value.left,clip.port.left);value.right=Math.min(value.right,clip.port.right);}
      if(clip.y){value.top=Math.max(value.top,clip.port.top);value.bottom=Math.min(value.bottom,clip.port.bottom);}
    }
    value.width=Math.max(0,value.right-value.left);value.height=Math.max(0,value.bottom-value.top);
    return value.width&&value.height?value:null;
  };
  const lost=(source,visible)=>!visible||source.width-visible.width>.75||source.height-visible.height>.75;
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  const segmenter=new Intl.Segmenter('ru',{granularity:'grapheme'});
  const fontFor=s=>{
    context.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;context.textAlign='left';context.textBaseline='alphabetic';
    context.direction=s.direction;context.fontKerning=s.fontKerning;context.fontStretch=s.fontStretch;
    if('letterSpacing' in context)context.letterSpacing=s.letterSpacing;
  };
  const metric=value=>{const m=context.measureText(value);return {width:m.width,actualBoundingBoxLeft:m.actualBoundingBoxLeft,actualBoundingBoxRight:m.actualBoundingBoxRight,
    actualBoundingBoxAscent:m.actualBoundingBoxAscent,actualBoundingBoxDescent:m.actualBoundingBoxDescent,
    fontBoundingBoxAscent:m.fontBoundingBoxAscent,fontBoundingBoxDescent:m.fontBoundingBoxDescent};};
  const textGeometry=root=>{
    const texts=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(!node.textContent.trim())continue;
      const parent=node.parentElement,s=getComputedStyle(parent);
      if(!parent.getClientRects().length||s.visibility!=='visible'||parent.closest('svg,.sr-only'))continue;
      const clips=clipping(parent),range=document.createRange();range.selectNodeContents(node);
      const ranges=[...range.getClientRects()].map(rect);fontFor(s);
      const graphemes=[];
      for(const item of segmenter.segment(node.textContent)){
        range.setStart(node,item.index);range.setEnd(node,item.index+item.segment.length);
        const r=box(range),m=metric(item.segment),visible=clipped(r,clips);
        // Range font boxes are not painted ink. Only provide an estimate when measured font-box height agrees.
        const compatible=Number.isFinite(m.fontBoundingBoxAscent)&&Number.isFinite(m.fontBoundingBoxDescent)
          &&Math.abs(r.height-m.fontBoundingBoxAscent-m.fontBoundingBoxDescent)<=1;
        const baseline=r.bottom-m.fontBoundingBoxDescent;
        const ink=compatible&&item.segment.trim()?{
          left:r.left-m.actualBoundingBoxLeft,right:r.left+m.actualBoundingBoxRight,
          top:baseline-m.actualBoundingBoxAscent,bottom:baseline+m.actualBoundingBoxDescent,
          width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent,
        }:null;
        const visibleInk=ink?clipped(ink,clips):null;
        graphemes.push({offset:item.index,text:item.segment,range:r,visibleRange:visible,rangeClipped:lost(r,visible),canvas:m,
          fontBoxCompatible:compatible,estimatedInk:ink,visibleEstimatedInk:visibleInk,estimatedInkClipped:ink?lost(ink,visibleInk):null});
      }
      texts.push({text:node.textContent,node:describe(parent),style:styles(parent),ranges,rangeBounds:union(ranges),
        clippingAncestors:clips,graphemes,rangeClippedCount:graphemes.filter(g=>g.text.trim()&&g.rangeClipped).length,
        estimatedInkClippedCount:graphemes.filter(g=>g.estimatedInkClipped).length});
    }
    return texts;
  };
  const measure=node=>{
    if(!node)return null;
    return {node:describe(node),rect:box(node),style:styles(node),clientWidth:node.clientWidth,clientHeight:node.clientHeight,
      scrollWidth:node.scrollWidth,scrollHeight:node.scrollHeight,scrollLeft:node.scrollLeft,scrollTop:node.scrollTop,
      text:node.textContent.trim(),textGeometry:textGeometry(node)};
  };
  const inputGeometry=input=>{
    const s=getComputedStyle(input);fontFor(s);const value=input.value||input.placeholder||'',textMetric=metric(value),r=box(input);
    return {node:describe(input),value:input.value,placeholder:input.placeholder,rect:r,style:styles(input),canvas:textMetric,
      clientWidth:input.clientWidth,scrollWidth:input.scrollWidth,scrollLeft:input.scrollLeft,
      contentWidth:input.clientWidth-(parseFloat(s.paddingLeft)||0)-(parseFloat(s.paddingRight)||0),
      note:'Native single-line input buffer; canvas width is not a DOM glyph-mask or multiline display contract.'};
  };
  const rows=[...document.querySelectorAll('#fixture-host [data-row]')].map(row=>{
    const id=row.dataset.row,definition=window.propertyListProbe?.rows.find(item=>item.id===id);
    const label=row.querySelector(':scope > .iq-control-label,:scope > .iq-property-label');
    // Public select/combobox surfaces are one level inside their existing select-wrap; date/static/tag surfaces are direct children.
    const value=row.querySelector(':scope > .iq-select-wrap > :is(.iq-select-trigger,.iq-combo-shell),:scope > .iq-date-trigger,:scope > .iq-tag-picker-field,:scope > .iq-property-value');
    const registered=row.tagName.startsWith('IQ-')?row.constructor===customElements.get(row.tagName.toLowerCase()):null;
    return {id,kind:definition?.kind||null,group:row.closest('[data-property-list]')?'property-list':'ordinary-reference',node:describe(row),
      registeredPublicElement:registered,rect:box(row),style:styles(row),clientWidth:row.clientWidth,scrollWidth:row.scrollWidth,
      controlValue:row.value??null,label:measure(label),value:measure(value),inputs:[...row.querySelectorAll('input:not([type="hidden"])')].filter(input=>input.getClientRects().length).map(inputGeometry)};
  });
  const visibleRanges=part=>part?.textGeometry.flatMap(text=>text.graphemes.filter(g=>g.text.trim()&&g.visibleRange).map(g=>g.visibleRange))||[];
  const rawRanges=part=>part?.textGeometry.flatMap(text=>text.graphemes.filter(g=>g.text.trim()).map(g=>g.range))||[];
  const overlaps=(left,right)=>{
    let count=0;const samples=[];
    for(const a of left)for(const b of right){const overlap=intersect(a,b);if(overlap&&overlap.width>.75&&overlap.height>.75){count++;if(samples.length<6)samples.push(overlap);}}
    return {count,samples};
  };
  const relations=[];
  for(let index=0;index<rows.length;index++){
    const row=rows[index],next=rows[index+1];
    relations.push({kind:'label-value',row:row.id,raw:overlaps(rawRanges(row.label),rawRanges(row.value)),
      clipped:overlaps(visibleRanges(row.label),visibleRanges(row.value))});
    if(next?.group===row.group)relations.push({kind:'adjacent-rows',row:row.id,next:next.id,
      raw:overlaps([...rawRanges(row.label),...rawRanges(row.value)],[...rawRanges(next.label),...rawRanges(next.value)]),
      clipped:overlaps([...visibleRanges(row.label),...visibleRanges(row.value)],[...visibleRanges(next.label),...visibleRanges(next.value)])});
  }
  const host=document.querySelector('#fixture-host'),list=document.querySelector('[data-property-list]');
  return {note:'Range geometry describes complete text advances, not painted glyph masks. Ink boxes are labelled estimates; inspect PNGs for actual clipping.',
    environment:{viewport:{width:innerWidth,height:innerHeight},rootFontSize:getComputedStyle(document.documentElement).fontSize,
      theme:document.documentElement.dataset.theme,density:document.documentElement.dataset.density,devicePixelRatio,visualViewportScale:visualViewport?.scale||null,
      date:new Date().toISOString(),fontStatus:document.fonts.status,fonts:[...document.fonts].map(font=>({family:font.family,weight:font.weight,style:font.style,status:font.status})),
      windowScroll:{x:scrollX,y:scrollY},activeElement:describe(document.activeElement),
      document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight}},
    host:host?{rect:box(host),style:styles(host),clientWidth:host.clientWidth,scrollWidth:host.scrollWidth}:null,
    list:list?{rect:box(list),style:styles(list)}:null,rows,relations,
    probe:window.propertyListProbe?{version:window.propertyListProbe.version,ready:window.propertyListProbe.ready,bootstrapError:window.propertyListProbe.bootstrapError,changes:window.propertyListProbe.changes}:null};
}
