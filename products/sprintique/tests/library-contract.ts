// Compiled against the packed package, not the neighboring source tree.
import {version,ui,formatDate,formatDateTime,type IqMarkdownEditor,type IqMarkdownViewer,type IqVisualChoice,settingsNavigation} from '@iquipage/web/core';
import type {IqImageCrop} from '@iquipage/web/advanced';
import type {IqWhiteboard} from '@iquipage/web/whiteboard';
const release:'0.6.0-vnext.48'=version;
export const choiceGroupsContract=()=>ui.choiceGroups({name:'task',value:'one',groups:[{id:'done',label:'Завершённые',collapsible:true,options:[{value:'one',label:'Первая задача'}]}]});
export function libraryContract(editor:IqMarkdownEditor,viewer:IqMarkdownViewer,crop:IqImageCrop,board:IqWhiteboard){
  editor.density='compact';editor.previewOnBlur=true;editor.interactiveTasks=true;
  editor.footerActions=[{id:'decision',label:'Требует решения',hint:'Обсуждение останется открытым',pressed:false,tone:'warning'}];
  viewer.interactiveTasks=true;crop.aspectRatio=12/5;board.editorMode='host';
  const dates:[string,string]=[formatDate('2000-10-04'),formatDateTime(new Date(),{timeZone:'UTC'})];
  return {release,dates,exportCover:()=>crop.export({size:1942,type:'image/webp'})};
}

export function settingsContract(choice:IqVisualChoice){
 choice.options=[{value:"light",label:"Светлая",preview:"light"}];choice.value="light";
 return settingsNavigation([{label:"Личные",items:[{id:"appearance",label:"Внешний вид"}]}],"appearance");
}
