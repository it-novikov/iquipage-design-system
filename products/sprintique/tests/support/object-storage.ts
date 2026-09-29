// A private S3 client for tests and the local stand: they put, read and remove objects next to the server under test.
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand} from '@aws-sdk/client-s3';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export interface ObjectStorage {
  put(key:string,bytes:Uint8Array,mime:string):Promise<void>;
  get(key:string):Promise<Uint8Array>;
  remove(key:string):Promise<void>;
  ready():Promise<void>;
}
export const S3Settings=z.strictObject({endpoint:z.url(),region:z.string().min(1),bucket:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),accessKeyId:z.string().min(1),secretAccessKey:z.string().min(1)});
export type S3Settings=z.infer<typeof S3Settings>;
export const objectKey=(asset:{projectId:string;id:string;sha256:string},variant:string)=>`assets/${asset.projectId}/${asset.id}/${asset.sha256}/${variant}`;
/** Private bucket, test-side credentials; keys are built as the server builds them. */
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
  /** An object's response once its headers arrived: the 15-second deadline covers only that, not the body. */
  private async opened(key:string){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await this.client.send(new GetObjectCommand({Bucket:this.settings.bucket,Key:key}),{abortSignal:controller.signal});
      if(!response.Body)throw Error('Object content missing');return response;}finally{clearTimeout(timer);}
  }
  /** Streams an object into a new private file and returns its SHA-256 and size; nothing is held whole. */
  async download(key:string,path:string){
    const response=await this.opened(key);
    const hash=createHash('sha256');let bytes=0;
    const counter=new Transform({transform(chunk:Buffer,_encoding,done){hash.update(chunk);bytes+=chunk.length;done(null,chunk);}});
    await pipeline(response.Body as Readable,counter,createWriteStream(path,{mode:0o600,flags:'wx'}));
    return {sha256:hash.digest('hex'),bytes};
  }
  /** Streams a file into an object. */
  async upload(key:string,path:string,mime:string){
    const {size}=await stat(path);
    await this.client.send(new PutObjectCommand({Bucket:this.settings.bucket,Key:key,Body:createReadStream(path),ContentLength:size,ContentType:mime}),{abortSignal:AbortSignal.timeout(600000)});
  }
  /** The SHA-256 of an object, read as a stream. */
  async sha256(key:string){
    const response=await this.opened(key);
    const hash=createHash('sha256');for await(const chunk of response.Body as AsyncIterable<Uint8Array>)hash.update(chunk);return hash.digest('hex');
  }
  async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.settings.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});}
  async ready(){await this.client.send(new HeadBucketCommand({Bucket:this.settings.bucket}),{abortSignal:AbortSignal.timeout(5000)});}
  close(){this.client.destroy();}
}
