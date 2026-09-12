'use strict';
/**
 * Shared, deliberately bounded Markdown subset. Source HTML is never interpreted.
 * No DOM, fetch, images, CSS from input, plugins or executable code.
 * Output consists solely of renderer-owned tags and escaped source strings.
 */
const LIMIT = 1000000;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeMarkdownURL(value) {
 const source=String(value??'').trim();
 // Do not allow whitespace, controls, a schemeless origin, credentials or backslashes.
 if(!source || /[\s\u0000-\u001f\u007f-\u009f\\]/.test(source))return null;
 if(/^#[A-Za-z0-9_\-:.\u0080-\uffff]+$/u.test(source))return source;
 if(!/^https:\/\//i.test(source))return null;
 try {const u=new URL(source);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
function findEnd(text, start, open, close) {
 let depth=1;
 for(let i=start;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]===open){if(++depth>12)return -1;}
  if(text[i]===close&&!--depth)return i;
 }
 return -1;
}
function inline(text,depth=0,allowLinks=true){
 if(depth>16)return esc(text);
 let out='',i=0;
 while(i<text.length){
  const rest=text.slice(i);
  if(text[i]==='\\' && i+1<text.length && /[\\`*_{}\[\]()#+\-.!|>~]/.test(text[i+1])){out+=esc(text[i+1]);i+=2;continue;}
  if(text[i]==='`'){
   const delimiter=/^`+/.exec(rest)[0],end=text.indexOf(delimiter,i+delimiter.length);
   if(end>=0){out+='<code>'+esc(text.slice(i+delimiter.length,end).replace(/\n/g,' '))+'</code>';i=end+delimiter.length;continue;}
  }
  const image=text.startsWith('![',i),link=text[i]==='[';
  if((image||link)&&allowLinks){
   const start=i+(image?2:1),end=findEnd(text,start,'[',']');
   if(end>=0&&text[end+1]==='('){
    const finish=findEnd(text,end+2,'(',')');
    if(finish>=0){
     const label=text.slice(start,end),raw=text.slice(end+2,finish).trim();
     const match=/^(<[^>]*>|.*?)(?:\s+"([^"]*)")?$/.exec(raw);
     const destination=(match?.[1]||'').replace(/^<|>$/g,'').replace(/\\([()])/g,'$1'),url=safeMarkdownURL(destination);
     const body=inline(label|| (image?'Изображение':'Ссылка'),depth+1,false);
     const rendered=url?`<a href="${esc(url)}"${url[0]==='#'?'':' target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"'}${match?.[2]?` title="${esc(match[2])}"`:''}>${body}</a>`:body;
     out+=image?`<span class="md-image-reference">${rendered}<span class="md-image-note"> (изображение по ссылке)</span></span>`:rendered;
     i=finish+1;continue;
    }
   }
  }
  if(allowLinks&&text[i]==='<'){
   const end=text.indexOf('>',i+1),url=end<0?null:safeMarkdownURL(text.slice(i+1,end));
   if(url&&url[0]!=='#'){out+=`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(text.slice(i+1,end))}</a>`;i=end+1;continue;}
  }
  let matched=false;
  for(const [mark,tag] of [['**','strong'],['__','strong'],['~~','del'],['*','em'],['_','em']]){
   if(!text.startsWith(mark,i))continue;
   if(mark.includes('_')&&i>0&&/[\p{L}\p{N}]/u.test(text[i-1]))continue;
   let end=text.indexOf(mark,i+mark.length);
   while(end>=0&&text[end-1]==='\\')end=text.indexOf(mark,end+mark.length);
   if(end>i+mark.length){out+=`<${tag}>${inline(text.slice(i+mark.length,end),depth+1,allowLinks)}</${tag}>`;i=end+mark.length;matched=true;break;}
  }
  if(matched)continue;
  if(text[i]==='\n'){out+='<br>';i++;continue;}
  // Gather ordinary text so a long paragraph does not repeatedly slice its entire suffix.
  const next=rest.slice(1).search(/[\\`*_[!<~\n]/),n=next<0?text.length:i+1+next;
  out+=esc(text.slice(i,n));i=n;
 }
 return out;
}
function splitCells(line){
 let s=line.trim();if(s[0]==='|')s=s.slice(1);if(s.endsWith('|')&&!s.endsWith('\\|'))s=s.slice(0,-1);
 const cells=[];let cell='',code=false;
 for(let i=0;i<s.length;i++){
  if(s[i]==='\\'&&s[i+1]==='|'){cell+='\\|';i++;continue;}
  if(s[i]==='`')code=!code;
  if(s[i]==='|'&&!code){cells.push(cell.trim());cell='';}else cell+=s[i];
 }
 cells.push(cell.trim());return cells;
}
const fence=line=>/^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
const heading=line=>/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(line);
const list=line=>/^( *)([-+*]|\d{1,9}[.)])\s+(.*)$/.exec(line);
const rule=line=>/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(line);
function tableStart(lines,i){if(!lines[i]?.includes('|')||!lines[i+1])return false;const cells=splitCells(lines[i+1]);return cells.length<=64&&cells.length===splitCells(lines[i]).length&&cells.every(c=>/^:?-{3,}:?$/.test(c));}
function renderBlocks(lines,level,depth=0){
 if(depth>16)return '<p>'+inline(lines.join('\n'))+'</p>';
 let out='',i=0;
 while(i<lines.length){
  const line=lines[i];if(!line.trim()){i++;continue;}
  const f=fence(line),h=heading(line),li=list(line);
  if(f){
   const content=[];i++;
   const ending=new RegExp('^ {0,3}'+(f[1][0]==='`'?'`':'~')+'{'+f[1].length+',}\\s*$');
   while(i<lines.length&&!ending.test(lines[i]))content.push(lines[i++]);
   if(i<lines.length)i++;
   const lang=/^[A-Za-z0-9_+#.-]{1,40}$/.test(f[2].trim())?f[2].trim():'';
   out+=`<pre class="md-code-scroll" tabindex="0" role="region" aria-label="Блок кода${lang?' '+esc(lang):''}"${lang?` data-language="${esc(lang)}"`:''}><code>${esc(content.join('\n'))}</code></pre>`;continue;
  }
  if(h){const n=Math.min(6,level+h[1].length-1);out+=`<h${n}>${inline(h[2])}</h${n}>`;i++;continue;}
  if(rule(line)){out+='<hr>';i++;continue;}
  if(tableStart(lines,i)){
   const headers=splitCells(line),align=splitCells(lines[i+1]).map(c=>c[0]===':'&&c.endsWith(':')?'center':c.endsWith(':')?'right':'left');i+=2;
   out+='<div class="md-table-scroll" tabindex="0" role="region" aria-label="Таблица, горизонтальная прокрутка"><table><thead><tr>'+headers.map((c,j)=>`<th scope="col" class="md-align-${align[j]}">${inline(c)}</th>`).join('')+'</tr></thead><tbody>';
   while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){
    const cells=splitCells(lines[i++]);out+='<tr>'+headers.map((_,j)=>`<td class="md-align-${align[j]}">${inline(cells[j]||'')}</td>`).join('')+'</tr>';
   }out+='</tbody></table></div>';continue;
  }
  if(/^ {0,3}>/.test(line)){
   const quoted=[];while(i<lines.length&&/^ {0,3}>/.test(lines[i]))quoted.push(lines[i++].replace(/^ {0,3}> ?/,''));
   out+='<blockquote>'+renderBlocks(quoted,level,depth+1)+'</blockquote>';continue;
  }
  if(li){
   const indent=li[1].length,ordered=/^\d/.test(li[2]),tag=ordered?'ol':'ul',start=ordered?Number.parseInt(li[2]):1;
   out+=`<${tag}${ordered&&start!==1?` start="${start}"`:''}>`;
   while(i<lines.length){
    const match=list(lines[i]);if(!match||match[1].length!==indent||/^\d/.test(match[2])!==ordered)break;
    let text=match[3];i++;const children=[];
    while(i<lines.length){
     if(!lines[i].trim()){if(lines[i+1]&&/^ +/.test(lines[i+1])&&lines[i+1].search(/\S/)>indent){children.push('');i++;continue;}break;}
     const child=list(lines[i]);if(child&&child[1].length<=indent)break;
     const space=lines[i].search(/\S/);if(space<=indent)break;
     children.push(lines[i++].slice(indent+2));
    }
    const task=/^\[([ xX])\]\s+(.*)$/.exec(text);
    out+=task?`<li class="md-task"><span class="md-task-mark ${task[1].toLowerCase()==='x'?'is-checked':''}" role="img" aria-label="${task[1].toLowerCase()==='x'?'Выполнено':'Не выполнено'}">${task[1].toLowerCase()==='x'?'✓':''}</span><div>${inline(task[2])}${children.length?renderBlocks(children,level,depth+1):''}</div></li>`:`<li>${inline(text)}${children.length?renderBlocks(children,level,depth+1):''}</li>`;
   }out+=`</${tag}>`;continue;
  }
  const paragraph=[line];i++;
  while(i<lines.length&&lines[i].trim()&&!fence(lines[i])&&!heading(lines[i])&&!rule(lines[i])&&!list(lines[i])&&!/^ {0,3}>/.test(lines[i])&&!tableStart(lines,i))paragraph.push(lines[i++]);
  out+='<p>'+inline(paragraph.join('\n'))+'</p>';
 }
 return out;
}
function safeMarkdown(source,options={}) {
 const value=String(source??'');
 if(value.length>LIMIT)throw new RangeError('Markdown превышает 1 000 000 знаков. Разделите документ.');
 const level=Number(options.headingLevel??2);
 if(!Number.isInteger(level)||level<1||level>6)throw new RangeError('headingLevel: целое число от 1 до 6');
 return renderBlocks(value.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n'),level);
}
Object.assign(exports,{safeMarkdown,safeMarkdownURL,MARKDOWN_MAX_LENGTH:LIMIT});
