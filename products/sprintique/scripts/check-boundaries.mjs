import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
const root=resolve('.');
const failures=[];
for(const folder of ['backend','contracts','client','web','ui']){
  for(const file of await readdir(folder,{recursive:true})){
    if(!/\.(?:[cm]?js|ts|css)$/.test(file))continue;
    const path=resolve(folder,file),source=await readFile(path,'utf8');
    const imports=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|@import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
    for(const specifier of imports){
      if(specifier.startsWith('.')&&!resolve(path,'..',specifier).startsWith(root+'/'))failures.push(`${folder}/${file}: outside product import ${specifier}`);
      if(/dist\/vendor|design-system\/|libraries\/iquipage/.test(specifier))failures.push(`${folder}/${file}: private DS path`);
      if(folder==='backend'&&(/iquipage|\/ui\/|\/web\//.test(specifier)))failures.push(`${folder}/${file}: backend imports presentation`);
      if(folder==='contracts'&&/backend|iquipage|\/ui\//.test(specifier))failures.push(`${folder}/${file}: contract dependency inversion`);
    }
  }
}
const pkg=JSON.parse(await readFile('package.json','utf8'));
for(const [name,value] of Object.entries({...pkg.dependencies,...pkg.devDependencies}))if(typeof value==='string'&&/^(file:)?\.\.\//.test(value))failures.push(`${name}: parent-relative dependency`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('PASS: product-contained imports, public DS entries, backend/presentation separation.');
