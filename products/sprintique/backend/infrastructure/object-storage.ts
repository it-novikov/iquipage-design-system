import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand} from '@aws-sdk/client-s3';
import {z} from 'zod';
export interface ObjectStorage {
  put(key:string,bytes:Uint8Array,mime:string):Promise<void>;
  get(key:string):Promise<Uint8Array>;
  remove(key:string):Promise<void>;
  ready():Promise<void>;
}
export const S3Settings=z.strictObject({endpoint:z.url(),region:z.string().min(1),bucket:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),accessKeyId:z.string().min(1),secretAccessKey:z.string().min(1)});
export type S3Settings=z.infer<typeof S3Settings>;
export const objectKey=(asset:{projectId:string;id:string;sha256:string},variant:string)=>`assets/${asset.projectId}/${asset.id}/${asset.sha256}/${variant}`;
/** No client-provided URL or key reaches this adapter. Private bucket, server-side credentials. */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client:S3Client;
  constructor(private readonly settings:S3Settings){
    S3Settings.parse(settings);const url=new URL(settings.endpoint);
    if(url.protocol!=='https:'&&!['localhost','127.0.0.1','garage'].includes(url.hostname))throw Error('Object storage requires HTTPS outside the local reference network');
    this.client=new S3Client({endpoint:settings.endpoint,region:settings.region,forcePathStyle:true,maxAttempts:2,
      requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',credentials:{accessKeyId:settings.accessKeyId,secretAccessKey:settings.secretAccessKey}});
  }
  async put(key:string,bytes:Uint8Array,mime:string){await this.client.send(new PutObjectCommand({Bucket:this.settings.bucket,Key:key,Body:bytes,ContentType:mime}),{abortSignal:AbortSignal.timeout(15000)});}
  async get(key:string){const response=await this.client.send(new GetObjectCommand({Bucket:this.settings.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});
    if(!response.Body)throw Error('Object content missing');
    const limit=10*1024*1024;
    const body=response.Body as typeof response.Body & AsyncIterable<Uint8Array> & {destroy?():void};
    if(response.ContentLength!==undefined&&response.ContentLength>limit){body.destroy?.();throw Error('Object exceeds canonical limit');}
    const chunks:Uint8Array[]=[];let length=0;
    try{for await(const chunk of body){length+=chunk.byteLength;if(length>limit)throw Error('Object exceeds canonical limit');chunks.push(chunk);}}
    catch(error){body.destroy?.();throw error;}
    return Buffer.concat(chunks,length);}
  async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.settings.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});}
  async ready(){await this.client.send(new HeadBucketCommand({Bucket:this.settings.bucket}),{abortSignal:AbortSignal.timeout(5000)});}
  close(){this.client.destroy();}
}
