export const appearanceDefaults=Object.freeze({theme:'system',accent:'blue',density:'comfortable',motion:'system'});
export const appearanceKey='sprintique.appearance.v1';
const values={theme:['system','light','dark'],accent:['blue','violet','green'],density:['comfortable','compact'],motion:['system','reduced']};
export function normalizeAppearance(input){return Object.fromEntries(Object.entries(values).map(([key,allowed])=>[key,allowed.includes(input?.[key])?input[key]:appearanceDefaults[key]]));}
export function createAppearance({storage,root,media,onChange=()=>{}}){
 let value={...appearanceDefaults},persistent=true;
 try{const saved=storage?.getItem(appearanceKey),legacy=storage?.getItem('sprintique.theme');value=normalizeAppearance(saved?JSON.parse(saved):['light','dark'].includes(legacy)?{theme:legacy}:null);}catch{persistent=false;}
 function apply(){root.dataset.theme=value.theme==='system'?(media.matches?'dark':'light'):value.theme;root.dataset.accent=value.accent;root.dataset.density=value.density;root.dataset.motion=value.motion;}
 function update(patch){value=normalizeAppearance({...value,...patch});apply();try{if(!storage)throw Error('Unavailable storage');storage.setItem(appearanceKey,JSON.stringify(value));persistent=true;}catch{persistent=false;}onChange({...value},persistent);return persistent;}
 const systemChange=()=>{if(value.theme==='system'){apply();onChange({...value},persistent);}};
 media.addEventListener('change',systemChange);apply();
 return {get value(){return {...value};},get persistent(){return persistent;},update,reset:()=>update(appearanceDefaults),toggleTheme:()=>update({theme:root.dataset.theme==='dark'?'light':'dark'}),destroy(){media.removeEventListener('change',systemChange);}};
}
let instance;
export function appearance(){
 if(!instance){let storage;try{storage=localStorage;}catch{/* Preference storage may be blocked. */}
 instance=createAppearance({storage,root:document.documentElement,media:matchMedia('(prefers-color-scheme: dark)'),onChange:()=>window.dispatchEvent(new Event('sprintique-appearance-change'))});}
 return instance;
}
