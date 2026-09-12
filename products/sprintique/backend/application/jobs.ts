import type {Transaction} from '../infrastructure/database.js';
/** The only queue producers are typed application use cases, never arbitrary HTTP job JSON. */
export async function enqueueAssetCleanup(tx:Transaction,projectId:string,assetId:string,revision:number,at:Date){
  await tx.query(`INSERT INTO work.jobs(project_id,kind,dedupe_key,payload,available_at) VALUES($1,'asset.gc',$2,$3,$4)
    ON CONFLICT(project_id,kind,dedupe_key) DO NOTHING`,[projectId,assetId+':'+revision,JSON.stringify({assetId}),at]);
}
