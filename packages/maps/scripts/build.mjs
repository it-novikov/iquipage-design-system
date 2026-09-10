import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.resolve(process.env.IQ_DS_ROOT||path.join(root,'../../design-system'));
const build=path.join(root,'.build/ds-candidate');
const out=path.join(root,'dist');
const hash=s=>createHash('sha256').update(s).digest('hex');
const expectedManifest='f252a499e00d7bab6088640126a406075a86bf109e673a257a002d8e90e9195c';
const manifest=await readFile(path.join(base,'MANIFEST.sha256'),'utf8');
if(hash(manifest)!==expectedManifest)throw new Error('Unsupported DS baseline; provenance review required.');
for(const line of manifest.trim().split('\n')){
 const m=line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
 if(!m||path.isAbsolute(m[2])||m[2].split('/').includes('..'))throw new Error('Invalid baseline manifest');
 if(hash(await readFile(path.join(base,m[2])))!==m[1])throw new Error('Changed baseline: '+m[2]);
}
// Build an explicit source candidate. The supplied release is never edited.
await mkdir(path.join(root,'.build'),{recursive:true});
await rm(build,{recursive:true,force:true});
await cp(base,build,{recursive:true});
const patch=async(name,old,next)=>{
 const p=path.join(build,name),s=await readFile(p,'utf8');
 if(!s.includes(old)||s.indexOf(old)!==s.lastIndexOf(old))throw new Error('Ambiguous source patch: '+name+' / '+old.slice(0,50));
 await writeFile(p,s.replace(old,next));
};
const api=await readFile(path.join(root,'ds-extension/public-api.inc.js'),'utf8');
await patch('src/modules/whiteboard.js',"static get observedAttributes(){return['readonly','state']}","static get observedAttributes(){return['readonly','state','surface-mode']}\n"+api);
await patch('src/modules/whiteboard.js','<main class="wb-center">','<section class="wb-center" aria-label="Поверхность карты">');
await patch('src/modules/whiteboard.js','</main><aside class="wb-panel"','</section><aside class="wb-panel"');
await patch('src/modules/whiteboard-studio.js','this.libraryOpen=innerWidth>760;','this.libraryOpen=this.surfaceMode===\'embedded\'?false:innerWidth>760;');
await patch('src/modules/whiteboard-workshop.js','  action(id,el){',`  action(id,el){
   if(this.surfaceMode==='embedded'&&['help','guide','templates','session','fullscreen'].includes(id)){
    this.emit('iq-host-command',{command:id});return;
   }`);
const cssPath=path.join(build,'src/styles/whiteboard-workshop.css');
await writeFile(cssPath,(await readFile(cssPath,'utf8'))+'\n'+await readFile(path.join(root,'ds-extension/embedded.css'),'utf8'));
const tokens=JSON.parse(await readFile(path.join(build,'tokens/semantic.json'),'utf8'));
tokens.meta.version='0.6.0-maps.1';tokens.meta.status='maps-source-candidate';
await writeFile(path.join(build,'tokens/semantic.json'),JSON.stringify(tokens,null,2));
execFileSync(process.execPath,[path.join(build,'scripts/build.mjs')],{cwd:build,stdio:'inherit'});
await mkdir(out,{recursive:true});
await rm(path.join(out,'vendor'),{recursive:true,force:true});
await cp(path.join(build,'dist'),path.join(out,'vendor'),{recursive:true});
await cp(path.join(build,'assets/icons'),path.join(out,'icons'),{recursive:true});
await writeFile(path.join(out,'candidate.json'),JSON.stringify({version:'0.6.0-maps.1',baseVersion:'0.5.7',baseManifest:expectedManifest,cssSha256:hash(await readFile(path.join(out,'vendor/iquipage.css'))),extensionSha256:hash(api),note:'Explicit DS source candidate; no production acceptance implied'},null,2)+'\n');
console.log('Maps DS candidate ready. Original design-system/ remains unchanged.');
