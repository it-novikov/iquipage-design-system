/** Never adopt a same-named volume belonging to another local project. */
export function ensureOwnedVolume(docker,name,container){
  const found=docker('volume','ls','--filter','name=^'+name+'$','--format','{{.Name}}');
  if(!found){docker('volume','create','--label','sprintique.owner=vnext-qa',name);return;}
  if(docker('volume','inspect','--format','{{index .Labels "sprintique.owner"}}',name)==='vnext-qa')return;
  // Compatibility with the first local launcher: Docker auto-created its unlabelled volumes.
  // Only an existing owned container, with no unrelated consumers, attests that exact volume.
  const consumers=docker('ps','-a','--filter','volume='+name,'--format','{{.Names}}').split('\n').filter(Boolean);
  if(!consumers.includes(container)||consumers.some(c=>docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',c)!=='vnext-qa'))throw Error('Refusing to adopt an unrelated or orphaned volume: '+name);
}
