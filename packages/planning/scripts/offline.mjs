/** Standalone fixture preview; native ESM identity is preserved with an import map. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const prefix='@sprintique/pn2',modules=new Map();
const allowed=['/packages/planning/src/','/packages/planning/demo/','/packages/maps/src/','/packages/maps/dist/vendor/'];
function normalize(from,target){
 if(target==='@iquipage/web/core')return '/packages/maps/dist/vendor/core.js';
 if(target==='@iquipage/web/advanced')return '/packages/maps/dist/vendor/advanced.js';
 if(!target.startsWith('.')&&!target.startsWith('/'))throw Error('Unmapped dependency: '+target);
 const name=path.posix.resolve(path.posix.dirname(from),target);
 if(!allowed.some(x=>name.startsWith(x)))throw Error('Outside preview roots: '+name);
 return name;
}
async function visit(name){
 if(modules.has(name))return;modules.set(name,'');const dependencies=[];
 let source=await readFile(path.join(root,name),'utf8');
 const replacement=(all,lead,quote,target)=>{const next=normalize(name,target);dependencies.push(next);return lead+quote+prefix+next+quote;};
 source=source.replace(/^(\s*(?:import|export)\s+[^\n;]*?\bfrom\s*)(['"])([^'"\n]+)\2/gm,replacement);
 source=source.replace(/^(\s*import\s*)(['"])([^'"\n]+)\2/gm,replacement);
 source=source.replace(/(\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g,replacement);
 modules.set(name,source);for(const next of dependencies)await visit(next);
}
await visit('/packages/planning/demo/app.js');
const imports=Object.fromEntries([...modules].sort(([a],[b])=>a.localeCompare(b)).map(([name,source])=>[prefix+name,'data:text/javascript;base64,'+Buffer.from(source).toString('base64')]));
let html=await readFile(path.join(root,'packages/planning/demo/index.html'),'utf8');
const sheets=[...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)].map(match=>match[1]);
const css=(await Promise.all(sheets.map(file=>readFile(path.join(root,path.posix.resolve('/packages/planning/demo',file)),'utf8')))).join('\n');
html=html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'').replace(/<script type="importmap">[\s\S]*?<\/script>/g,'').replace(/<script type="module" src="[^"]+"><\/script>/g,'');
html=html.replace('</head>',`<style>${css}</style><script type="importmap">${JSON.stringify({imports}).replaceAll('<','\\u003c')}</script></head>`);
html=html.replace('</body>',`<script type="module">import '${prefix}/packages/planning/demo/app.js';</script></body>`);
const output=path.join(root,'packages/planning/dist');await mkdir(output,{recursive:true});
await writeFile(path.join(output,'Sprintique-Planning-PN2.html'),html);
await writeFile(path.join(output,'offline.json'),JSON.stringify({scope:'fixture-only',moduleCount:modules.size,htmlBytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')},null,2));
console.log('Built offline PN2 fixture:',modules.size,'modules,',Buffer.byteLength(html),'bytes');
