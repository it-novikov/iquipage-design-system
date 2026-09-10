import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const sha=data=>createHash('sha256').update(data).digest('hex');
export async function fingerprint(){
  const files={};
  async function visit(relative){
    for(const entry of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=path.posix.join(relative,entry.name);
      if(entry.isDirectory())await visit(name);
      else if(entry.isFile())files[name]=sha(await readFile(path.join(root,name)));
      else throw Error('Unsupported source entry: '+name);
    }
  }
  for(const dir of ['src','demo','server','scripts','tests','types','ds-extension'])await visit(dir);
  for(const file of ['package.json','package-lock.json'])files[file]=sha(await readFile(path.join(root,file)));
  return {sha256:sha(JSON.stringify(files)),files};
}
