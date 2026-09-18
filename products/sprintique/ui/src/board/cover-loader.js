import {requireValue} from '../common.js';
/** View-owned, bounded thumbnail cache. URLs never enter task records. */
export function createCoverLoader(adapter,projectId){
  const cache=new Map();let observer,closed=false,generation=0,visible=new Set(),active=0,queue=[];
  function trim(){for(const [key,item] of cache){if(cache.size<=48)break;if(!visible.has(key)&&item.url){URL.revokeObjectURL(item.url);cache.delete(key);}}}
  async function resource(input){
    const key=input.taskId+':'+input.id;
    if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry.promise;}
    const entry={url:null,controller:new AbortController()};
    entry.promise=adapter.blob({...input,variant:'thumb'},{signal:entry.controller.signal}).then(blob=>{
      requireValue(blob.type==='image/webp','FILE_PREVIEW','Неподдерживаемая миниатюра.');
      if(closed)throw new DOMException('Closed','AbortError');entry.url=URL.createObjectURL(blob);trim();return entry.url;
    }).catch(error=>{cache.delete(key);throw error;});cache.set(key,entry);return entry.promise;
  }
  function invalidate(key,url){const entry=cache.get(key);if(entry?.url===url){URL.revokeObjectURL(url);cache.delete(key);}}
  function pump(){
    while(!closed&&active<4&&queue.length){const job=queue.shift();if(job.generation!==generation||!job.img.isConnected)continue;active++;
      const key=job.img.dataset.coverTask+':'+job.img.dataset.coverId;let url;
      resource({id:job.img.dataset.coverId,taskId:job.img.dataset.coverTask,projectId}).then(async value=>{
        url=value;if(job.generation===generation&&job.img.isConnected&&visible.has(key)){job.img.src=url;job.img.hidden=false;await job.img.decode();if(job.generation===generation&&job.img.isConnected)job.img.parentElement.dataset.state='ready';}
      }).catch(()=>{if(url)invalidate(key,url);if(job.img.isConnected&&job.generation===generation){job.img.parentElement.dataset.state='unavailable';job.img.hidden=true;job.img.nextElementSibling.textContent='Обложка недоступна';}}).finally(()=>{delete job.img.dataset.coverQueued;active--;pump();});
    }
  }
  return {
    mount(root){observer?.disconnect();generation++;queue=[];visible=new Set();
      if(!adapter){root.querySelectorAll('img[data-cover-id]').forEach(img=>{img.hidden=true;img.parentElement.dataset.state='unavailable';img.nextElementSibling.textContent='Обложка недоступна';img.parentElement.setAttribute('aria-label',img.parentElement.getAttribute('aria-label')+'. Обложка недоступна: хранилище файлов не подключено.');});return;}
      observer=new IntersectionObserver(entries=>{for(const entry of entries){const img=entry.target,key=img.dataset.coverTask+':'+img.dataset.coverId;if(!entry.isIntersecting){visible.delete(key);img.removeAttribute('src');continue;}visible.add(key);if(img.dataset.coverQueued||img.hasAttribute('src')&&cache.has(key))continue;img.dataset.coverQueued='true';queue.push({img,generation});}pump();trim();},{root,rootMargin:'120px'});
      root.querySelectorAll('img[data-cover-id]').forEach(img=>observer.observe(img));trim();
    },
    destroy(){closed=true;generation++;queue=[];observer?.disconnect();for(const item of cache.values()){item.controller.abort();if(item.url)URL.revokeObjectURL(item.url);}cache.clear();}
  };
}
