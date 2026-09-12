import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {waitForChild} from '../scripts/child-exit.mjs';

test('R4-REL-01 child exit propagates success, failure and signal; removes forwarded listeners',async()=>{
  const listeners={SIGTERM:process.listenerCount('SIGTERM'),SIGINT:process.listenerCount('SIGINT')};
  for(const [script,expected] of [['process.exit(0)',0],['process.exit(7)',7],['process.kill(process.pid,"SIGTERM")',1]]){
    const child=spawn(process.execPath,['-e',script],{stdio:'ignore'});
    assert.equal(await waitForChild(child,{forwardSignals:true}),expected);
    for(const signal of Object.keys(listeners))assert.equal(process.listenerCount(signal),listeners[signal]);
  }
});
test('R4-REL-01 spawn errors reject rather than report a green test run',async()=>{
  const child=spawn('/sprintique-test-nonexistent-executable',[],{stdio:'ignore'});
  await assert.rejects(waitForChild(child),{code:'ENOENT'});
});
test('R4-REL-01 forwarded interruption fails even when the child gracefully exits zero',{timeout:10000},async()=>{
  // Emit only inside a disposable parent process; never signal this test runner or services.
  for(const signal of ['SIGINT','SIGTERM']){
    const script=`import {spawn} from 'node:child_process'; import {once} from 'node:events';
      import {waitForChild} from ${JSON.stringify(new URL('../scripts/child-exit.mjs',import.meta.url).href)};
      const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>process.exit(0));process.stdout.write("ready");setInterval(()=>{},1000)']);
      const result=waitForChild(child,{forwardSignals:true});
      await once(child.stdout,'data');process.emit(${JSON.stringify(signal)});process.exitCode=await result;`;
    const parent=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'ignore'});
    assert.equal(await waitForChild(parent),1);
  }
});
