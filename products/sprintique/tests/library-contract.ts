// Compiled against the packed package, not the neighboring source tree.
import {version,type IqMarkdownEditor,type IqMarkdownViewer} from '@iquipage/web/core';
import type {IqImageCrop} from '@iquipage/web/advanced';
import type {IqWhiteboard} from '@iquipage/web/whiteboard';
const release:'0.6.0-vnext.1'=version;
export function libraryContract(editor:IqMarkdownEditor,viewer:IqMarkdownViewer,crop:IqImageCrop,board:IqWhiteboard){
  editor.density='compact';editor.previewOnBlur=true;editor.interactiveTasks=true;
  editor.footerActions=[{id:'decision',label:'Требует решения',pressed:false,tone:'warning'}];
  viewer.interactiveTasks=true;crop.aspectRatio=12/5;board.editorMode='host';
  return {release,exportCover:()=>crop.export({size:1942,type:'image/webp'})};
}
