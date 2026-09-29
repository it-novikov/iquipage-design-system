import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Sha256,digestFile,WHOLE_DIGEST_LIMIT} from '../web/file-digest.js';

test('the incremental SHA-256 matches node:crypto for every padding boundary and any chunking',()=>{
  for(const length of [0,1,55,56,57,63,64,65,119,120,127,128,129,1000,65537]){
    const bytes=randomBytes(length),digest=new Sha256();
    for(let offset=0;offset<length;){const step=1+((offset*7919)%131);digest.update(bytes.subarray(offset,offset+step));offset+=step;}
    assert.equal(digest.hex(),createHash('sha256').update(bytes).digest('hex'),`length ${length}`);
  }
});
test('a file past the WebCrypto limit is hashed slice by slice, with progress, and can be cancelled',async()=>{
  const bytes=randomBytes(WHOLE_DIGEST_LIMIT+12345),file=new File([bytes],'big.bin'),seen=[];
  assert.equal(await digestFile(file,{onProgress:loaded=>seen.push(loaded)}),createHash('sha256').update(bytes).digest('hex'));
  assert.ok(seen.length>2&&seen.at(-1)===file.size,'progress reaches the end');
  const controller=new AbortController();
  await assert.rejects(digestFile(file,{signal:controller.signal,onProgress:loaded=>{if(loaded>0)controller.abort();}}),{name:'AbortError'});
  const small=new File([Buffer.from('маленький')],'a.txt');
  assert.equal(await digestFile(small),createHash('sha256').update('маленький').digest('hex'));
});
