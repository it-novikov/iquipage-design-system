/** Deterministic offline preview. Native ESM import maps retain module identity. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=new Map(),prefix='@iquipage/maps';
const sha=s=>createHash('sha256').update(s).digest('hex');
const normalize=(from,target)=>{
  if(!target.startsWith('.')&&!target.startsWith('/'))throw Error('Unexpected external dependency: '+target);
  const result=path.posix.resolve(path.posix.dirname(from),target);
  if(!['/src/','/demo/','/dist/vendor/'].some(p=>result.startsWith(p)))throw Error('Module outside allowed roots: '+result);
  return result;
};
async function visit(name){
  if(modules.has(name))return;
  modules.set(name,'');
  let source=await readFile(path.join(root,name.slice(1)),'utf8');
  if(name==='/demo/app.js'){
    const marker="browser=params.get('storage')==='browser'";
    if(!source.includes(marker))throw Error('Preview storage adapter marker changed');
    source=source.replace(marker,'browser=true');
  }
  const dependencies=[];
  source=source.replace(/^(\s*(?:import|export)\s+[^\n;]*?\bfrom\s*)(['"])([^'"\n]+)\2/gm,(_all,lead,quote,target)=>{
    const next=normalize(name,target);dependencies.push(next);return lead+quote+prefix+next+quote;
  });
  source=source.replace(/^(\s*import\s*)(['"])([^'"\n]+)\2/gm,(_all,lead,quote,target)=>{
    const next=normalize(name,target);dependencies.push(next);return lead+quote+prefix+next+quote;
  });
  modules.set(name,source);
  for(const target of dependencies)await visit(target);
}
await visit('/demo/app.js');
const imports=Object.fromEntries([...modules].sort(([a],[b])=>a.localeCompare(b)).map(([name,source])=>[prefix+name,'data:text/javascript;base64,'+Buffer.from(source).toString('base64')]));
const css=(await Promise.all(['dist/vendor/iquipage.css','src/maps.css','demo/shell.css','src/board/board.css'].map(p=>readFile(path.join(root,p),'utf8')))).join('\n');
let html=await readFile(path.join(root,'demo/index.html'),'utf8');
html=html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'');
html=html.replace(/<script\b[^>]*src="\/demo\/app.js"[^>]*><\/script>/g,'');
html=html.replace('href="/demo/?standalone=1"','href="?standalone=1"');
const map=JSON.stringify({imports}).replaceAll('<','\\u003c');
html=html.replace('</head>',`<style>${css}</style>\n<script type="importmap">${map}</script>\n</head>`);
html=html.replace('</body>',`<script type="module">import '${prefix}/demo/app.js';</script>\n</body>`);
await writeFile(path.join(root,'preview.html'),html);
await mkdir(path.join(root,'dist'),{recursive:true});
await writeFile(path.join(root,'dist/preview.json'),JSON.stringify({format:'native-esm-importmap/1',storage:'browser',moduleCount:modules.size,htmlSha256:sha(html),htmlBytes:Buffer.byteLength(html),externalRequests:0},null,2)+'\n');
console.log(`Offline preview: ${modules.size} modules, ${Buffer.byteLength(html)} bytes, sha256 ${sha(html)}`);
