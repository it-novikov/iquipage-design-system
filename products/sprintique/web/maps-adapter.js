import {MapInput,MapTemplateInput} from '../contracts/maps.ts';
import {ApiError} from '../client/api.ts';

/** Presentation records are translated at the boundary; clocks and actor IDs never cross it. */
export async function mapWriteBody(repository,record,baseRevision,{signal}={}){
  const previous=baseRevision?await repository.client.request(`/projects/${encodeURIComponent(record.projectId)}/maps/${encodeURIComponent(record.id)}`,'GET',undefined,undefined,signal):null;
  if(previous&&previous.revision!==baseRevision)throw new ApiError('CONFLICT','Карта изменилась. Ваша копия не перезаписана.',409);
  const document=await repository.mapMedia.dehydrate(record,{signal});
  const value=MapInput.parse(Object.fromEntries(Object.keys(MapInput.shape).map(key=>[key,
    key==='session'&&record.session?{phase:record.session.phase,voteLimit:record.session.voteLimit}:key==='document'?document:record[key]])));
  const body={baseRevision,value};
  if(record.session){
    body.votes=record.session.votes;
    if(!previous||JSON.stringify(record.session.timer)!==JSON.stringify(previous.session.timer))body.timer={remaining:record.session.timer.remaining,running:!!record.session.timer.endsAt};
  }
  return body;
}
export function templateWriteBody(record,baseRevision){
  return {baseRevision,value:MapTemplateInput.parse(Object.fromEntries(Object.keys(MapTemplateInput.shape).map(key=>[key,record[key]])))};
}
