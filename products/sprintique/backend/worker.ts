import {setTimeout} from 'node:timers/promises';
import {JobQueue} from './infrastructure/job-queue.js';
import {S3ObjectStorage,S3Settings} from './infrastructure/object-storage.js';
const url=process.env['WORKER_DATABASE_URL'];if(!url)throw Error('WORKER_DATABASE_URL required');
const queue=new JobQueue(url);await queue.checkRole();
const storage=new S3ObjectStorage(S3Settings.parse({endpoint:process.env['S3_ENDPOINT'],region:process.env['S3_REGION'],bucket:process.env['S3_BUCKET'],accessKeyId:process.env['S3_ACCESS_KEY_ID'],secretAccessKey:process.env['S3_SECRET_ACCESS_KEY']}));
await storage.ready();const controller=new AbortController();
process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
try{while(!controller.signal.aborted){try{if(await queue.collectOne(storage))continue;}catch{process.stderr.write('Worker iteration unavailable; retrying.\n');}await setTimeout(1000,undefined,{signal:controller.signal}).catch(()=>{});}}
finally{await queue.close();storage.close();}
