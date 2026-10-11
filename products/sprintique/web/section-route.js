import {wikiRoute} from './wiki-model.js';
// Resolve after mounting: Maps may already have selected its canonical document.
// An empty Maps view emits no onOpenMap, so it still needs a section URL.
export function sectionRouteHash(mode,currentHash){
  if(mode==='wiki'&&wikiRoute(currentHash).kind!=='invalid')return currentHash;
  if(mode==='maps'&&/^#maps\/[A-Za-z0-9_-]+$/.test(currentHash))return currentHash;
  if(mode==='settings'&&/^#settings\/[a-z-]+$/.test(currentHash))return currentHash;
  if(mode==='finance'&&/^#finance\/[A-Za-z0-9_-]+$/.test(currentHash))return currentHash;
  return '#'+mode;
}
export function retainedRouteHash(mode,board,currentHash){
  if(board?.routeHash)return board.routeHash;
  const task=board?.currentTask?.();
  return task?'#/task/'+encodeURIComponent(task):sectionRouteHash(mode,currentHash);
}
