import {Sha256} from './file-digest.js';
/** Hashes one File slice by slice off the main thread, reporting progress; the page terminates it to cancel. */
const SLICE=8*1024*1024;
self.onmessage=async({data:file})=>{
  try{
    const sha=new Sha256();
    for(let offset=0;offset<file.size;offset+=SLICE){
      sha.update(new Uint8Array(await file.slice(offset,offset+SLICE).arrayBuffer()));
      self.postMessage({loaded:Math.min(file.size,offset+SLICE)});
    }
    self.postMessage({digest:sha.hex()});
  }catch(error){self.postMessage({error:String(error?.message||error)});}
};
