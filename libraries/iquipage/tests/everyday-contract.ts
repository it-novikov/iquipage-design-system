import {registerCore,registerMarkdownViewer,registerWorkLayout,IqMarkdownViewer,IqWorkLayout,safeMarkdown,safeMarkdownURL,WorkDensity} from '../types/core.js';
registerCore();registerMarkdownViewer();registerWorkLayout();
const reader: IqMarkdownViewer=document.createElement('iq-markdown-viewer');
reader.value='# Результат\n\n| A | B |\n|---|---|\n|1|2|';reader.headingLevel=2;
const layout:IqWorkLayout=document.createElement('iq-work-layout');const density:WorkDensity='compact';layout.density=density;
const result:string=safeMarkdown(reader.value,{headingLevel:2});const url:string|null=safeMarkdownURL('https://example.com');
// @ts-expect-error Invalid heading levels are not accepted.
reader.headingLevel=8;
// @ts-expect-error This changes spacing, not a font size.
layout.density='small';
console.log(result,url);
