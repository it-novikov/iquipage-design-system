import {WikiCatalog,WikiPage,PutWikiPage,WikiWriteResponse,WikiSearch,WikiHistory,WikiVersion,RestoreWikiVersion,WikiTaskLinks,PutWikiTaskLink,WikiTaskLink,WikiLinkWriteResponse,WikiBacklinks} from '../contracts/wiki.ts';

const segment=encodeURIComponent;
const base=projectId=>`/projects/${segment(projectId)}`;
const pagePath=(projectId,id)=>`${base(projectId)}/wiki/${segment(id)}`;
const query=values=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null)params.set(key,String(value));return params.size?'?'+params:'';};

/** Typed wiki commands share the repository transport and stable command keys. */
export const wikiMethods={
  async listWikiPages(projectId,{includeArchive=false,signal}={}){
    return WikiCatalog.parse(await this.client.request(`${base(projectId)}/wiki${query({includeArchive})}`,'GET',undefined,undefined,signal));
  },
  async readWikiPage(projectId,id,{signal}={}){
    return WikiPage.parse(await this.client.request(pagePath(projectId,id),'GET',undefined,undefined,signal));
  },
  async putWikiPage(projectId,id,input,{signal}={}){
    const path=pagePath(projectId,id),body=PutWikiPage.parse(input);
    const saved=WikiWriteResponse.parse(await this.client.request(path,'PUT',body,await this.key(path,body),signal));
    this.listeners.forEach(fn=>fn({collection:'wikiPages',projectId,id:saved.id,pageId:saved.id,revision:saved.revision}));return saved;
  },
  async searchWiki(projectId,q,cursor,{signal}={}){
    return WikiSearch.parse(await this.client.request(`${base(projectId)}/wiki-search${query({q,cursor})}`,'GET',undefined,undefined,signal));
  },
  async listWikiHistory(projectId,id,before,{signal}={}){
    return WikiHistory.parse(await this.client.request(`${pagePath(projectId,id)}/history${query({before})}`,'GET',undefined,undefined,signal));
  },
  async readWikiVersion(projectId,id,revision,{signal}={}){
    return WikiVersion.parse(await this.client.request(`${pagePath(projectId,id)}/versions/${segment(revision)}`,'GET',undefined,undefined,signal));
  },
  async restoreWikiVersion(projectId,id,input,{signal}={}){
    const path=`${pagePath(projectId,id)}/restore`,body=RestoreWikiVersion.parse(input);
    const saved=WikiWriteResponse.parse(await this.client.request(path,'POST',body,await this.key(path,body),signal));
    this.listeners.forEach(fn=>fn({collection:'wikiPages',projectId,id:saved.id,pageId:saved.id,revision:saved.revision}));return saved;
  },
  async listTaskWikiLinks(projectId,task,{signal}={}){
    return WikiTaskLinks.parse(await this.client.request(`${base(projectId)}/tasks/${segment(task)}/wiki-links`,'GET',undefined,undefined,signal));
  },
  async putTaskWikiLink(projectId,task,pageId,input,{signal}={}){
    const path=`${base(projectId)}/tasks/${segment(task)}/wiki-links/${segment(pageId)}`,body=PutWikiTaskLink.parse(input);
    const saved=WikiLinkWriteResponse.parse(await this.client.request(path,'PUT',body,await this.key(path,body),signal));
    this.listeners.forEach(fn=>fn({collection:'wikiTaskLinks',projectId,taskId:saved.taskId,pageId:saved.pageId,revision:saved.revision}));return saved;
  },
  async readTaskWikiLink(projectId,task,pageId,{signal}={}){
    return WikiTaskLink.parse(await this.client.request(`${base(projectId)}/tasks/${segment(task)}/wiki-links/${segment(pageId)}`,'GET',undefined,undefined,signal));
  },
  async listWikiBacklinks(projectId,id,cursor,{signal}={}){
    return WikiBacklinks.parse(await this.client.request(`${pagePath(projectId,id)}/tasks${query({cursor})}`,'GET',undefined,undefined,signal));
  }
};
