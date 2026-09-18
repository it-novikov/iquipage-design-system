/** One-time extraction of approved source. Refuses to overwrite either destination. */
import {cp,mkdir,access,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ds=path.join(root,'libraries/iquipage'),product=path.join(root,'products/sprintique');
for(const target of [ds,product]){try{await access(target);throw Error('Target exists: '+target);}catch(e){if(e.code!=='ENOENT')throw e;}}
await mkdir(ds,{recursive:true});
const candidate=path.join(root,'packages/maps/.build/ds-candidate');
for(const name of ['src','types','tokens','assets','scripts','tests','docs'])await cp(path.join(candidate,name),path.join(ds,name),{recursive:true});
const info=JSON.parse(await readFile(path.join(candidate,'package.json'),'utf8'));
info.version='0.6.0-vnext.0';info.description='IQUIPAGE standalone Web Components library';
info.files=['dist','types','tokens','assets/icons','LICENSE','README.md','PROVENANCE.json'];
info.scripts={build:'node scripts/build.mjs',test:'node --test tests/*.test.cjs',prepack:'node scripts/build.mjs'};
info.engines={node:'>=24 <25'};
await writeFile(path.join(ds,'package.json'),JSON.stringify(info,null,2)+'\n');
const tokens=JSON.parse(await readFile(path.join(ds,'tokens/semantic.json'),'utf8'));tokens.meta.version=info.version;tokens.meta.status='source-owned-library';
await writeFile(path.join(ds,'tokens/semantic.json'),JSON.stringify(tokens,null,2)+'\n');
await cp(path.join(root,'packages/maps/ds-extension/v3-api.d.ts'),path.join(ds,'types/vnext.d.ts'));
await mkdir(path.join(product,'ui'),{recursive:true});
for(const name of ['src','types'])await cp(path.join(root,'packages/maps',name),path.join(product,'ui',name),{recursive:true});
await cp(path.join(root,'packages/maps/demo/shell.css'),path.join(product,'ui/shell.css'));
console.log('Materialized independent library and product UI. Historical inputs unchanged.');
