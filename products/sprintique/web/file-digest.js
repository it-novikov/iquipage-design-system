/** SHA-256 of a File without holding it: WebCrypto for small files, an incremental digest over slices for large ones. */
const K=new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);

/** An incremental SHA-256 (FIPS 180-4): update() with any number of chunks, then hex(). */
export class Sha256 {
  constructor(){this.state=new Int32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.w=new Int32Array(64);this.block=new Uint8Array(64);this.filled=0;this.length=0;}
  update(bytes){
    let offset=0;this.length+=bytes.length;
    if(this.filled){const take=Math.min(64-this.filled,bytes.length);this.block.set(bytes.subarray(0,take),this.filled);this.filled+=take;offset=take;if(this.filled<64)return this;this.compress(this.block,0);this.filled=0;}
    for(;offset+64<=bytes.length;offset+=64)this.compress(bytes,offset);
    if(offset<bytes.length){this.block.set(bytes.subarray(offset),0);this.filled=bytes.length-offset;}
    return this;
  }
  hex(){
    const bits=this.length*8,tail=new Uint8Array((this.filled<56?64:128)-this.filled);tail[0]=0x80;
    const view=new DataView(tail.buffer),end=tail.length;view.setUint32(end-8,Math.floor(bits/2**32));view.setUint32(end-4,bits>>>0);
    this.update(tail);return [...this.state].map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
  }
  compress(bytes,offset){
    const w=this.w,s=this.state;
    for(let i=0;i<16;i++){const j=offset+i*4;w[i]=bytes[j]<<24|bytes[j+1]<<16|bytes[j+2]<<8|bytes[j+3];}
    for(let i=16;i<64;i++){
      const a=w[i-15],b=w[i-2];
      w[i]=((a>>>7|a<<25)^(a>>>18|a<<14)^(a>>>3))+w[i-16]+((b>>>17|b<<15)^(b>>>19|b<<13)^(b>>>10))+w[i-7]|0;
    }
    let a=s[0],b=s[1],c=s[2],d=s[3],e=s[4],f=s[5],g=s[6],h=s[7];
    for(let i=0;i<64;i++){
      const t1=h+((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7))+(e&f^~e&g)+K[i]+w[i]|0;
      const t2=((a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10))+(a&b^a&c^b&c)|0;
      h=g;g=f;f=e;e=d+t1|0;d=c;c=b;b=a;a=t1+t2|0;
    }
    s[0]=s[0]+a|0;s[1]=s[1]+b|0;s[2]=s[2]+c|0;s[3]=s[3]+d|0;s[4]=s[4]+e|0;s[5]=s[5]+f|0;s[6]=s[6]+g|0;s[7]=s[7]+h|0;
  }
}

/** Files up to this size are hashed by WebCrypto in one piece; larger ones slice by slice, never whole in memory. */
export const WHOLE_DIGEST_LIMIT=64*1024*1024;
const SLICE=8*1024*1024;
const hex=buffer=>[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');

/** A large file is hashed in a Worker so the page stays responsive; without Worker support, here, slice by slice. */
function digestInWorker(file,{signal,onProgress}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./digest-worker.js',import.meta.url),{type:'module'});
    const stop=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{stop();reject(signal.reason??new DOMException('Загрузка отменена','AbortError'));};
    worker.onmessage=({data})=>{
      if(data.loaded!==undefined)onProgress(data.loaded);
      else if(data.digest){stop();resolve(data.digest);}
      else{stop();reject(new Error(data.error||'Не удалось проверить файл.'));}
    };
    worker.onerror=event=>{event.preventDefault();stop();reject(new Error('Не удалось проверить файл.'));};
    signal?.addEventListener('abort',abort,{once:true});worker.postMessage(file);
  });
}

export async function digestFile(file,{signal,onProgress=()=>{}}={}){
  signal?.throwIfAborted();onProgress(0);
  if(file.size<=WHOLE_DIGEST_LIMIT){const digest=hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));signal?.throwIfAborted();onProgress(file.size);return digest;}
  if(typeof Worker==='function')return digestInWorker(file,{signal,onProgress});
  const sha=new Sha256();
  for(let offset=0;offset<file.size;offset+=SLICE){
    sha.update(new Uint8Array(await file.slice(offset,offset+SLICE).arrayBuffer()));
    signal?.throwIfAborted();onProgress(Math.min(file.size,offset+SLICE));
  }
  return sha.hex();
}
