/** A task viewed from a map keeps that map in its address. Direct task links keep taskURL's canonical route. */
export function parseMapRoute(hash){
  const match=/^#maps(?:\/([A-Za-z0-9_-]+)(?:\/task\/([^/?#]+)(?:\/(work))?)?)?$/.exec(hash);
  if(!match)return null;
  try{return {mapId:match[1]||null,taskKey:match[2]?decodeURIComponent(match[2]):null,section:match[3]?'work':'task'};}
  catch{return null;}
}
export function mapRouteHash(mapId,task=null,section='task'){
  return '#maps'+(mapId?'/'+encodeURIComponent(mapId)+(task?'/task/'+encodeURIComponent(task)+(section==='work'?'/work':''):''):'');
}
