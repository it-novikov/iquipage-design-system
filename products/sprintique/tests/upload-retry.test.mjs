import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uploadSpent} from '../ui/src/board/upload-retry.js';

const failure=(code,status)=>Object.assign(Error(code),{code,status});

test('a refused, expired or finished upload is retried as a new upload',()=>{
  assert.equal(uploadSpent(failure('IMAGE_UNREADABLE',422)),true,'the server quarantined the content');
  assert.equal(uploadSpent(failure('UPLOAD_EXPIRED',410)),true);
  assert.equal(uploadSpent(failure('FILE_STATE',409)),true,'the reservation is finished or deleted');
  assert.equal(uploadSpent(failure('FILE_OWNER',403)),true);
});

test('a transient failure keeps the reservation and resends to it',()=>{
  assert.equal(uploadSpent(failure('FILE_BUSY',409)),false);
  assert.equal(uploadSpent(failure('FILE_NETWORK',503)),false);
  assert.equal(uploadSpent(failure('FILE_TIMEOUT',503)),false);
  assert.equal(uploadSpent(Object.assign(Error('cancel'),{name:'AbortError'})),false);
  assert.equal(uploadSpent(null),false);
});
