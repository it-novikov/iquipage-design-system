import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database} from '../backend/infrastructure/database.js';
import {createApp} from '../backend/http/app.js';
import {serveWeb} from '../backend/http/static.js';

test('R4-PERF-01 only hashed public assets are immutable; HTML/auth/errors stay no-store',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'sprintique-static-test-'));
  const db=new Database('postgresql://unused@127.0.0.1:1/unused');
  const app=await createApp({db,origin:'http://localhost'});
  try{
    await mkdir(join(directory,'assets'));
    await writeFile(join(directory,'index.html'),'<!doctype html><title>Test</title>');
    await writeFile(join(directory,'assets/app-1234abcd.js'),'export const version=1;');
    await writeFile(join(directory,'assets/plain.js'),'export const unversioned=true;');
    serveWeb(app,directory);
    const first=await app.inject('/assets/app-1234abcd.js');
    assert.equal(first.statusCode,200);
    assert.equal(first.headers['cache-control'],'public, max-age=31536000, immutable');
    const etag=String(first.headers.etag);
    assert.match(etag,/^"[A-Za-z0-9_-]+"$/);
    const second=await app.inject({url:'/assets/app-1234abcd.js',headers:{'if-none-match':etag}});
    assert.equal(second.statusCode,304);
    assert.equal(second.body,'');
    assert.equal(second.headers.etag,etag);
    const weak=await app.inject({url:'/assets/app-1234abcd.js',headers:{'if-none-match':'"different", W/'+etag}});
    assert.equal(weak.statusCode,304);
    assert.equal((await app.inject({url:'/assets/app-1234abcd.js',headers:{'if-none-match':'*'}})).statusCode,304);
    const head=await app.inject({method:'HEAD',url:'/assets/app-1234abcd.js'});
    assert.equal(head.statusCode,200);assert.equal(head.body,'');assert.equal(head.headers.etag,etag);
    assert.equal((await app.inject({url:'/assets/app-1234abcd.js',headers:{'if-none-match':'"old"'}})).statusCode,200);
    for(const url of ['/','/assets/plain.js','/assets/missing-1234abcd.js','/api/v1/session','/api/v1/projects/no-access/assets/private/original']){
      const response=await app.inject(url);
      assert.equal(response.headers['cache-control'],'no-store',url);
      assert.equal(response.headers.etag,undefined,url);
    }
  }finally{
    await app.close();await db.close();await rm(directory,{recursive:true,force:true});
  }
});
