import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {sourceInputs,changedInputs,fingerprint} from './source-inputs.mjs';

test('R4-REL-02 fingerprints HTML and detects changed, added and removed inputs, excluding private/build output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sprintique-source-inputs-'));
  const put=async(path,value='test')=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),value);};
  try{
    for(const path of ['libraries/iquipage/package-lock.json','products/sprintique/package-lock.json','products/sprintique/web/index.html','scripts/verify-vnext.mjs','.github/workflows/vnext.yml'])await put(path);
    for(const path of ['products/sprintique/output/private.json','products/sprintique/dist/bundle.js','products/sprintique/.env','products/sprintique/.env.production','products/sprintique/node_modules/test.js'])await put(path,'MUST_NOT_READ');
    const before=await sourceInputs(root);
    assert.equal(before.length,5);
    assert.ok(before.some(input=>input.path==='products/sprintique/web/index.html'));
    await put('products/sprintique/web/index.html','changed HTML');
    await put('products/sprintique/web/icon.svg');
    await rm(join(root,'scripts/verify-vnext.mjs'));
    const after=await sourceInputs(root);
    assert.deepEqual(changedInputs(before,after),['products/sprintique/web/icon.svg','products/sprintique/web/index.html','scripts/verify-vnext.mjs']);
    assert.notEqual(fingerprint(before),fingerprint(after));
    assert.deepEqual(changedInputs(after,await sourceInputs(root)),[]);
    for(const path of ['index.html','whiteboard.html','workbench.html','tokens/tokens.css','assets/iquipage-mark.svg','assets/icons/plus.svg'])await put('libraries/iquipage/'+path,'GENERATED');
    assert.deepEqual(changedInputs(after,await sourceInputs(root)),[]);
    await put('libraries/iquipage/src/template.html','ACTUAL TEMPLATE INPUT');
    assert.deepEqual(changedInputs(after,await sourceInputs(root)),['libraries/iquipage/src/template.html']);
    await symlink(join(root,'products/sprintique/.env'),join(root,'products/sprintique/web/leak.json'));
    await assert.rejects(sourceInputs(root),/refuses symlinks/);
  }finally{await rm(root,{recursive:true,force:true});}
});
