import {WindowIndex} from './window-index.js';
export interface TableWindowOptions<T> {
  body:HTMLTableSectionElement;scrollRoot:HTMLElement;columns:number;
  key:(row:T)=>string;markup:(row:T,index:number)=>string;
  decorate?:(node:HTMLTableRowElement,row:T)=>void;estimate?:number;
}
/** Windowing controller for the supplied native table composition. No product or network model. */
export class TableWindow<T> {
  private rows:T[]=[];private index:WindowIndex;private enabled=false;
  private nodes=new Map<string,{node:HTMLTableRowElement;html:string}>();
  private abort=new AbortController();private resize:ResizeObserver;private frame=0;private disposed=false;
  private byId=new Map<string,number>();private pinned:string|null=null;
  constructor(private options:TableWindowOptions<T>){
    this.index=new WindowIndex([],options.estimate??96);
    const schedule=()=>this.schedule();
    options.scrollRoot.addEventListener('scroll',schedule,{passive:true,signal:this.abort.signal});
    window.addEventListener('resize',()=>{this.index=new WindowIndex(this.rows.map(options.key),options.estimate??96);this.schedule();},{signal:this.abort.signal});
    options.body.addEventListener('focusin',event=>{this.pinned=(event.target as Element).closest<HTMLElement>('[data-window-id]')?.dataset.windowId||null;this.schedule();},{signal:this.abort.signal});
    options.body.addEventListener('focusout',()=>queueMicrotask(()=>{if(!options.body.contains(document.activeElement)){this.pinned=null;this.schedule();}}),{signal:this.abort.signal});
    options.body.addEventListener('keydown',event=>this.keydown(event),{signal:this.abort.signal});
    this.resize=new ResizeObserver(entries=>{
      for(const entry of entries){const id=(entry.target as HTMLElement).dataset.windowId,i=id?this.byId.get(id):undefined;
        if(i!==undefined&&entry.contentRect.height>0)this.index.measure(i,entry.target.getBoundingClientRect().height);}
      this.schedule();
    });
  }
  setRows(rows:T[],enabled=true):void {
    this.rows=rows;this.enabled=enabled;const keys=rows.map(this.options.key);this.index.setItems(keys);
    this.byId=new Map(keys.map((key,i)=>[key,i]));this.render();
  }
  refresh():void {for(const [id,{node}] of this.nodes){const i=this.byId.get(id);if(i!==undefined)this.options.decorate?.(node,this.rows[i]!);}}
  private schedule():void {if(this.frame||this.disposed)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
  private render():void {
    if(this.disposed)return;
    const {body,scrollRoot,key,markup,columns}=this.options;
    const viewport=scrollRoot.getBoundingClientRect(),bounds=body.getBoundingClientRect();
    const pinned=this.pinned?this.byId.get(this.pinned):undefined;
    const segments=this.enabled?this.index.segments(viewport.top-bounds.top,viewport.bottom-bounds.top,4,pinned===undefined?[]:[pinned]):[{kind:'rows' as const,from:0,to:this.rows.length}];
    const children:HTMLTableRowElement[]=[],keep=new Set<string>();
    for(const segment of segments){
      if(segment.kind==='space'){
        const spacer=document.createElement('tr');spacer.className='iq-window-space';spacer.setAttribute('aria-hidden','true');spacer.setAttribute('role','presentation');
        const cell=document.createElement('td');cell.colSpan=columns;cell.style.height=segment.height+'px';spacer.append(cell);children.push(spacer);continue;
      }
      for(let i=segment.from;i<segment.to;i++){
        const row=this.rows[i]!,id=key(row),html=markup(row,i);keep.add(id);let item=this.nodes.get(id);
        if(!item){const temp=document.createElement('tbody');temp.innerHTML=html;const node=temp.firstElementChild;
          if(!(node instanceof HTMLTableRowElement))throw new TypeError('TableWindow renderer must return a table row');
          item={node,html};this.nodes.set(id,item);this.resize.observe(node);
        }else if(item.html!==html){const temp=document.createElement('tbody');temp.innerHTML=html;const next=temp.firstElementChild!;
          const focus=item.node.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.focus:null;
          item.node.innerHTML=next.innerHTML;for(const attr of [...next.attributes])item.node.setAttribute(attr.name,attr.value);item.html=html;
          if(focus)item.node.querySelector<HTMLElement>('[data-focus="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});
        }
        item.node.dataset.windowId=id;item.node.setAttribute('aria-rowindex',String(i+2));this.options.decorate?.(item.node,row);children.push(item.node);
      }
    }
    const retained=new Set<Node>(children);for(const node of [...body.children])if(!retained.has(node))node.remove();
    let before:Element|null=body.firstElementChild;for(const node of children){if(node!==before)body.insertBefore(node,before);before=node.nextElementSibling;}
    for(const [id,item] of this.nodes)if(!keep.has(id)){this.resize.unobserve(item.node);this.nodes.delete(id);}
    body.parentElement?.setAttribute('aria-rowcount',String(this.rows.length+1));
  }
  private keydown(event:KeyboardEvent):void {
    if(this.options.body.closest('[data-work-dragging]'))return;
    const active=event.target as HTMLElement;if(active.closest('iq-menu,iq-select,iq-combobox,iq-remote-combobox,textarea,[contenteditable=true]'))return;
    if(active instanceof HTMLInputElement&&!['checkbox','radio'].includes(active.type))return;
    const row=active.closest<HTMLElement>('[data-window-id]'),index=row?.dataset.windowId?this.byId.get(row.dataset.windowId):undefined;
    if(index===undefined)return;
    const controls=[...row!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')];
    let next=index,slot=controls.indexOf(active);
    if(event.key==='ArrowUp')next--;
    else if(event.key==='ArrowDown')next++;
    else if(event.key==='Home'&&event.ctrlKey)next=0;
    else if(event.key==='End'&&event.ctrlKey)next=this.rows.length-1;
    else if(event.key==='Tab'){
      if(!event.shiftKey&&slot===controls.length-1){next++;slot=0;}
      else if(event.shiftKey&&slot===0){next--;slot=-1;}
      else return;
      const id=next>=0&&next<this.rows.length?this.options.key(this.rows[next]!):null;
      if(!id||this.nodes.has(id))return;
    }else return;
    if(next<0||next>=this.rows.length||next===index)return;
    event.preventDefault();this.focusRow(next,slot);
  }
  focusRow(index:number,slot=0):void {
    if(this.disposed||index<0||index>=this.rows.length)return;
    this.pinned=this.options.key(this.rows[index]!);
    const {body,scrollRoot}=this.options,view=scrollRoot.getBoundingClientRect(),origin=body.getBoundingClientRect().top;
    const top=origin+this.index.offset(index),bottom=origin+this.index.offset(index+1);
    if(top<view.top)scrollRoot.scrollTop+=top-view.top;
    else if(bottom>view.bottom)scrollRoot.scrollTop+=bottom-view.bottom;
    this.render();const node=this.nodes.get(this.pinned)?.node;
    const controls=node?[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')]:[];
    (slot<0?controls.at(-1):controls[Math.min(slot,controls.length-1)])?.focus({preventScroll:true});
  }
  destroy():void {this.disposed=true;cancelAnimationFrame(this.frame);this.abort.abort();this.resize.disconnect();this.nodes.clear();this.options.body.replaceChildren();}
}
