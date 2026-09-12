import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative,join,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';

const excluded=new Set(['node_modules','dist','build','output','.playwright-cli','.git','test-results','playwright-report']);
const extensions=new Set(['.ts','.js','.mjs','.cjs','.css','.html','.sql','.json','.tgz','.webp','.png','.svg','.jpg','.jpeg','.avif','.gif','.woff','.woff2','.ttf','.otf','.wasm','.yml','.yaml']);
// Exact outputs of libraries/iquipage/scripts/build.mjs, not build inputs.
// The corresponding src templates/modules and semantic tokens remain fingerprinted.
const libraryOutputs=new Set(['index.html','whiteboard.html','workbench.html','tokens/tokens.css','assets/iquipage-mark.svg'].map(path=>'libraries/iquipage/'+path));
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fingerprint=inputs=>sha256(JSON.stringify(inputs));
export async function sourceInputs(root){
  const inputs=[];
  async function walk(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(excluded.has(entry.name)||entry.name==='.env'||entry.name.startsWith('.env.'))continue;
      const file=join(directory,entry.name);
      const sourcePath=relative(root,file).split(sep).join('/');
      if(libraryOutputs.has(sourcePath)||sourcePath==='libraries/iquipage/assets/icons')continue;
      if(entry.isSymbolicLink())throw Error('Source fingerprint refuses symlinks: '+relative(root,file));
      if(entry.isDirectory()){await walk(file);continue;}
      if(!entry.isFile()||!extensions.has(extname(entry.name))&&!['Dockerfile','.dockerignore'].includes(entry.name))continue;
      inputs.push({path:sourcePath,sha256:sha256(await readFile(file))});
    }
  }
  for(const folder of ['libraries/iquipage','products/sprintique','scripts'])await walk(resolve(root,folder));
  const workflow='.github/workflows/vnext.yml';
  inputs.push({path:workflow,sha256:sha256(await readFile(resolve(root,workflow)))});
  inputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  for(const required of ['products/sprintique/web/index.html','products/sprintique/package-lock.json','libraries/iquipage/package-lock.json']){
    if(!inputs.some(input=>input.path===required))throw Error('Missing verification input: '+required);
  }
  return inputs;
}
export function changedInputs(before,after){
  const left=new Map(before.map(input=>[input.path,input.sha256]));
  const right=new Map(after.map(input=>[input.path,input.sha256]));
  return [...new Set([...left.keys(),...right.keys()])].filter(path=>left.get(path)!==right.get(path)).sort();
}
