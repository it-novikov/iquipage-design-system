// Resolve after mounting: Maps may already have selected its canonical document.
// An empty Maps view emits no onOpenMap, so it still needs a section URL.
export function sectionRouteHash(mode,currentHash){
  if(mode==='maps'&&/^#maps\/[A-Za-z0-9_-]+$/.test(currentHash))return currentHash;
  return '#'+mode;
}
