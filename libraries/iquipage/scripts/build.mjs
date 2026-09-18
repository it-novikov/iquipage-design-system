import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFile(path.join(root,p),'utf8');
const save=async(p,s)=>{await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),s)};
const tokens=JSON.parse(await read('tokens/semantic.json'));
const manifest=JSON.parse(await read('src/manifest.json'));
const variables=entries=>Object.entries(entries).map(([k,v])=>`  --iq-${k}: ${v};`).join('\n');
const tokenCSS=`/* Generated from tokens/semantic.json. */\n:root{\n${variables({...tokens.base,...tokens.light})}\n}\n[data-theme="dark"]{\n${variables(tokens.dark)}\n}\n`;
await save('tokens/tokens.css',tokenCSS);
const css=tokenCSS+await read('src/styles/foundation.css')+'\n'+await read('src/styles/whiteboard.css')+'\n'+await read('src/styles/everyday.css')+'\n'+await read('src/styles/whiteboard-workshop.css');
await save('dist/iquipage.css',css);
const sources={};
for (const name of manifest.application){
 sources[name]=await read(`src/modules/${name}`);
 new Function('exports','require',sources[name]); // Parse every module before emitting artifacts.
}
const render=names=>names.map(n=>`"./${n}":function(exports,require){\n${sources[n]}\n}`).join(',\n');
const runtime=`};const cache={};function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};if(!modules[id])throw Error('Unknown IQUIPAGE module '+id);modules[id](m.exports,require);return m.exports;}`;
const bundle=`window.IQ_TOKENS=${JSON.stringify(tokens)};(()=>{const modules={\n${render(manifest.application)}\n${runtime}\nrequire('./app.js');})();`;
const demoCSS=css+'\n'+await read('src/styles/everyday-demo.css');
const html=(await read('src/template.html')).replace('__IQ_CSS__',()=>demoCSS).replace('__IQ_SCRIPT__',()=>bundle.replaceAll('</script','<\\/script'));
await save('index.html',html);
// Standards-based ESM graph: one module URL owns each shared primitive/class.
// core never imports roadmap, graph, crop, catalog, state or sample assets.
const moduleDeps={};
for (const name of manifest.library) {
 const deps=[...new Set([...sources[name].matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)].map(m=>m[1]))];
 moduleDeps[name]=deps;
 const imports=deps.map((d,i)=>`import dep${i} from './${d}';`).join('\n');
 const lookup=deps.map((d,i)=>`${JSON.stringify('./'+d)}:dep${i}`).join(',');
 await save('dist/modules/'+name,`${imports}\nconst exports={};\nconst deps={${lookup}};\n(function(exports,require){\n${sources[name]}\n})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});\nexport default exports;\n`);
}
for (const name of ['core','advanced','whiteboard','iquipage']) await save('dist/'+name+'.js',await read('src/entries/'+name+'.js'));
await save('dist/entry-manifest.json',JSON.stringify({version:tokens.meta.version,sharedModules:moduleDeps,entries:manifest.entries},null,2)+'\n');
const req=createRequire(import.meta.url), icons=req('../src/modules/icons.js');
for(const [key,glyph] of Object.entries(icons.glyphs))await save(`assets/icons/${key}.svg`,icons.icon(key,24));
await save('assets/iquipage-mark.svg',icons.mark());
await save('dist/build.json',JSON.stringify({version:tokens.meta.version,htmlSha256:createHash('sha256').update(html).digest('hex'),cssSha256:createHash('sha256').update(css).digest('hex'),modules:manifest.application.length,exportedModules:manifest.library.length},null,2)+'\n');
console.log(`Built IQUIPAGE ${tokens.meta.version}: HTML, CSS, ESM, ${manifest.application.length} source modules, ${Object.keys(icons.glyphs).length} SVG icons.`);

const whiteboardBundle=bundle.replace("require('./app.js');",`const {registerWhiteboard}=require('./whiteboard.js');registerWhiteboard();const {IqWhiteboardDemo}=require('./whiteboard-stories.js');customElements.define('iq-whiteboard-demo',IqWhiteboardDemo);`);
const whiteboardHTML=(await read('src/whiteboard-template.html')).replace('__IQ_CSS__',()=>demoCSS).replace('__IQ_SCRIPT__',()=>whiteboardBundle.replaceAll('</script','<\\/script'));
await save('whiteboard.html',whiteboardHTML);

const everydayBundle=bundle.replace("require('./app.js');","require('./everyday-stories.js').registerEverydayDemo();");
await save('workbench.html',(await read('src/workbench-template.html')).replace('__IQ_CSS__',()=>demoCSS).replace('__IQ_SCRIPT__',()=>everydayBundle.replaceAll('</script','<\\/script')));
