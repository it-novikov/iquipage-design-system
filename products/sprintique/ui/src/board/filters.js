export const ownerKey=task=>task.ownerId?'user:'+task.ownerId:task.owner?.trim()?'name:'+task.owner.trim().toLocaleLowerCase('ru'):'none';
export function normalizeBoardFilters(value={}){
  const array=name=>Array.isArray(value[name])?[...new Set(value[name].filter(item=>typeof item==='string'))]:[];
  return {owners:array('owners'),releases:array('releases'),tags:array('tags'),tagMode:value.tagMode==='all'?'all':'any'};
}
export function hasBoardFilters(value){return !!(value.owners.length||value.releases.length||value.tags.length);}
export function taskMatchesFilters(task,filters){
  if(filters.owners.length&&!filters.owners.includes(ownerKey(task)))return false;
  if(filters.releases.length&&!filters.releases.includes(task.releaseId||'none'))return false;
  if(filters.tags.length){
    const ids=new Set(task.tagIds||[]),match=id=>ids.has(id);
    if(filters.tagMode==='all'?!filters.tags.every(match):!filters.tags.some(match))return false;
  }
  return true;
}
