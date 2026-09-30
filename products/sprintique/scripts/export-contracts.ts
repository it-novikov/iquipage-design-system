// The public API contract for the Kotlin server, from the Zod contracts the web client also validates with.
// Writes server/src/main/resources/contracts/public-schemas.json; with --check, fails when that file is out of date.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import * as core from '../contracts/index.js';
import * as planning from '../contracts/planning.js';
import {planningResponseSchemas} from '../contracts/planning-responses.js';
import * as view from '../contracts/planning-view.js';
import * as workspace from '../contracts/workspace.js';
import * as membership from '../contracts/membership.js';
import {mapSchemas} from '../contracts/maps.js';
import {mediaSchemas} from '../contracts/media.js';
import {agentSchemas} from '../contracts/agents.js';
import {RetryJob} from '../contracts/operations.js';
import {EventHeadResponse} from '../contracts/events.js';
import {financeSchemas} from '../contracts/finance.js';
import {accessSchemas} from '../contracts/access.js';

const extra={RetryJob,EventHeadResponse,
  TaskPosition:z.strictObject({baseRevision:core.Revision,status:core.TaskInput.shape.status,rank:core.TaskInput.shape.rank}),
  ViewReleaseQuery:z.strictObject({groupId:core.Id,cursor:z.string().max(3000).optional()})};
const sources={...core,...planning,...planningResponseSchemas,...view,...workspace,...membership,...mapSchemas,...mediaSchemas,...agentSchemas,...financeSchemas,...accessSchemas,...extra};
const schemas:Record<string,unknown>=Object.fromEntries(Object.entries(sources).sort(([a],[b])=>a.localeCompare(b))
  .flatMap(([name,schema])=>schema instanceof z.ZodType?[[name,z.toJSONSchema(schema)]]:[]));
schemas['Problem']={type:'object',required:['code','message','requestId'],properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string'}}};
const text=JSON.stringify({planningPolicy:planning.PLANNING_POLICY,schemas},null,2)+'\n';
const target=resolve(import.meta.dirname,'../server/src/main/resources/contracts/public-schemas.json');
if(process.argv.includes('--check')){
  const current=await readFile(target,'utf8').catch(()=>'');
  if(current!==text){console.error('server/src/main/resources/contracts/public-schemas.json is out of date: run npm run contracts');process.exit(1);}
  console.log('Public contract schemas are current.');
}else{
  await mkdir(dirname(target),{recursive:true});await writeFile(target,text);
  console.log(`Wrote ${Object.keys(schemas).length} public schemas.`);
}
