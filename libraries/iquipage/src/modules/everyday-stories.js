'use strict';
// Catalog-only sample data. Not part of any runtime ESM entry.
const C=require('./components.js'),U=require('./ui.js');
const {registerWorkHeader}=require('./work-header.js');
const {registerWorkLayout}=require('./work-layout.js');
const {registerMarkdownViewer}=require('./markdown-viewer.js');
const {registerEditors}=require('./editor.js');
const report=`# Проверка сценария приглашения

Проверен **первый рабочий путь**: открыть проект, найти задачу и прочитать результат проверки. Это образец отчёта, а не подтверждение выполнения задачи.

## Что проверено

- Название проекта видно до начала прокрутки.
- Основное действие остаётся рядом с заголовком.
- Ссылки доступны с клавиатуры.
  - Широкая таблица прокручивается внутри документа.
  - Длинная строка кода не расширяет страницу.

## Результаты

| Область | Светлая тема | Тёмная тема | Примечание |
| --- | :---: | :---: | --- |
| Название и действие | Проверено | Проверено | Без обрезки текста |
| Чтение отчёта | Проверено | Проверено | Без панели редактирования |
| Отправка приглашения | Не проверено | Не проверено | Сервер не подключён |

## Пример данных

\`\`\`json
{
  "project": "Sprintique",
  "status": "review_required",
  "description": "Длинная строка сохранена целиком, чтобы проверить горизонтальную прокрутку внутри блока кода, не всей страницы.",
  "accepted": false
}
\`\`\`

> Прочитать отчёт — не значит принять результат. Решение остаётся за человеком.

### Следующий шаг

1. Сопоставить выводы с критериями задачи.
2. Проверить серверный сценарий отдельно.
3. Зафиксировать решение в приложении.

- [x] Собраны наблюдения
- [ ] Выполнена серверная проверка

[Документация проекта](https://example.com/docs) открывается только по нажатию.

![Приложенный снимок](https://example.com/private/screenshot.png)

HTML не выполняется: \`<script>alert('example')</script>\`.
`;
const records=[
 ['SPR-128','Подготовить страницу нового релиза','active','Мария Лебедева','18 сент'],
 ['SPR-129','Проверить сценарий приглашения в команду','review','Александр Ким','12 сент'],
 ['SPR-130','Уточнить состояния загрузки документов','backlog','Дмитрий Соколов','20 сент'],
 ['SPR-131','Подготовить цифровой паспорт изделия','backlog','Анна Волкова','25 сент'],
 ['SPR-132','Настроить семантические цвета двух тем','done','Мария Лебедева','6 сент'],
 ['SPR-133','Согласовать структуру продуктовой библиотеки','done','Александр Ким','8 сент'],
 ['SPR-134','Проверить форму на мобильной ширине','active','Анна Волкова','19 сент'],
 ['SPR-135','Подготовить описание следующего выпуска','backlog','Дмитрий Соколов','24 сент'],
 ['SPR-136','Уточнить критерии принятия результата агента','review','Мария Лебедева','22 сент'],
 ['SPR-137','Проверить возвращение из карточки к списку','active','Александр Ким','23 сент'],
 ['SPR-138','Обновить примеры интеграции','backlog','Дмитрий Соколов','26 сент'],
 ['SPR-139','Проверить клавиатурную навигацию','active','Анна Волкова','27 сент']
];
const kinds={tasks:['Задачи','Новая задача'],ideas:['Идеи','Новая идея'],plan:['План','Добавить работу'],releases:['Релизы','Новый релиз'],admin:['Участники','Пригласить']};
const info={backlog:['Запланировано','planned'],active:['В работе','info'],review:['На проверке','warning'],done:['Готово','success']};
class IqEverydayDemo extends C.IqElement{
 mount(){
  this.kind=this.getAttribute('scenario')||'tasks';this.query='';this.filter='all';this.rows=records.map(r=>[...r]);this.sort=false;this.preview=false;
  this.innerHTML=`<div class="daily-demo"><div class="daily-demo-controls" aria-label="Настройки примера"><span>Рабочая композиция</span><div class="iq-work-toolbar-group"><button type="button" class="iq-btn ghost sm" data-e="long" aria-pressed="false">Длинное название</button><button type="button" class="iq-btn secondary sm" data-e="density" aria-pressed="true">Компактно</button></div></div><iq-work-layout density="compact" sticky-header label="Пример рабочего пространства"><iq-work-header slot="header" title="Выпуск 2.5" eyebrow="Sprintique / Команда продукта" description="Всё, что нужно довести до следующего выпуска."><button type="button" slot="actions" class="iq-btn primary sm" data-e="create">${kinds[this.kind][1]} ${C.icon('plus',16)}</button></iq-work-header><nav class="iq-work-navigation" slot="navigation" aria-label="Разделы проекта">${Object.entries(kinds).map(([key,[label]])=>`<button type="button" data-e="section" data-kind="${key}"${key===this.kind?' aria-current="page"':''}>${label}</button>`).join('')}</nav><div class="iq-work-summary" slot="summary"><span><b data-e-count>12</b> <span data-e-type>задач в проекте</span></span><span>4 участника</span><span class="daily-demo-disclaimer">Локальный пример</span></div><div class="iq-work-toolbar" slot="toolbar"><div class="iq-field"><label class="sr-only" for="daily-search-${this.id||'sample'}">Найти в списке</label><div class="iq-input-shell">${C.icon('search',16)}<input id="daily-search-${this.id||'sample'}" data-e-search placeholder="Найти по названию…" type="search" autocomplete="off"></div></div><div class="iq-work-toolbar-group"><button class="iq-btn ghost sm" type="button" data-e="filter" aria-pressed="false">Только в работе</button><button class="iq-btn secondary sm" type="button" data-e="sort" aria-pressed="false">По названию ${C.icon('sort',16)}</button></div></div><div class="iq-work-data" data-e-data></div><div class="iq-work-footer" slot="footer"><span data-e-result role="status" aria-live="polite"></span><button type="button" class="iq-btn ghost sm" data-e="report">Прочитать отчёт ${C.icon('arrow',16)}</button></div></iq-work-layout><div class="daily-dialog-slot"></div></div>`;
  this.renderRows();
  this.listen(this,'input',e=>{if(e.target.matches('[data-e-search]')){this.query=e.target.value;this.renderRows();}});
  this.listen(this,'click',e=>{const b=e.target.closest('[data-e]');if(!b)return;
   const action=b.dataset.e;
   if(action==='density'){const l=this.querySelector('iq-work-layout'),on=l.density!=='compact';l.density=on?'compact':'comfortable';b.setAttribute('aria-pressed',String(on));b.textContent=on?'Компактно':'Свободно';}
   if(action==='long'){const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));this.querySelector('iq-work-header').setAttribute('title',on?'Подготовка международного запуска новой коллекции и проверка ключевых сценариев совместной работы':'Выпуск 2.5');}
   if(action==='section'){this.kind=b.dataset.kind;this.querySelectorAll('[data-e=section]').forEach(x=>x===b?x.setAttribute('aria-current','page'):x.removeAttribute('aria-current'));this.querySelector('[data-e=create]').innerHTML=C.escapeHTML(kinds[this.kind][1])+C.icon('plus',16);this.renderRows();}
   if(action==='filter'){this.filter=this.filter==='all'?'active':'all';b.setAttribute('aria-pressed',String(this.filter!=='all'));this.renderRows();}
   if(action==='sort'){this.sort=!this.sort;b.setAttribute('aria-pressed',String(this.sort));this.renderRows();}
   if(action==='open'||action==='report')this.openReport(b.dataset.id,b);
   if(action==='create')this.openCreate(b);
  });
 }
 renderRows(){
  let rows=this.rows.filter(r=>(this.filter==='all'||r[2]===this.filter)&&r.join(' ').toLocaleLowerCase('ru').includes(this.query.toLocaleLowerCase('ru')));if(this.sort)rows=rows.toSorted((a,b)=>a[1].localeCompare(b[1],'ru'));
  const isPlan=this.kind==='plan',isAdmin=this.kind==='admin';
  this.querySelector('[data-e-type]').textContent={tasks:'задач в проекте',ideas:'идей для обсуждения',plan:'работ в плане',releases:'материалов выпуска',admin:'записей участников'}[this.kind];
  this.querySelector('[data-e-count]').textContent=String(this.rows.length);
  if(isPlan){
   const {IqRoadmap}=require('./roadmap.js');if(!customElements.get('iq-roadmap'))customElements.define('iq-roadmap',IqRoadmap);
   const roadmap=document.createElement('iq-roadmap');roadmap.data={title:'Интервалы и связи',revision:1,rows:rows.map((r,i)=>({id:r[0],title:r[1],start:'2026-09-'+String(1+i).padStart(2,'0'),end:'2026-09-'+String(10+i).padStart(2,'0'),kind:'task'})),dependencies:[]};roadmap.today='2026-09-07';roadmap.range={start:'2026-09-01',end:'2026-09-30'};
   this.querySelector('[data-e-data]').replaceChildren(roadmap);this.querySelector('[data-e-result]').textContent=`${rows.length} работ. Начало и окончание можно изменить.`;return;
  }

  this.querySelector('[data-e-data]').innerHTML=rows.length?`<table class="iq-work-table"><caption class="sr-only">${kinds[this.kind][0]} проекта</caption><colgroup><col style="width:50%"><col style="width:18%"><col style="width:21%"><col style="width:11%"></colgroup><thead><tr><th scope="col">${isAdmin?'Участник':isPlan?'Работа и интервал':this.kind==='ideas'?'Идея':'Название'}</th><th scope="col">${isAdmin?'Доступ':'Статус'}</th><th scope="col">${isAdmin?'Роль':'Ответственный'}</th><th scope="col">${isPlan?'Конец':'Срок'}</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-work-row="${r[0]}"><td><div class="iq-work-row-title"><button type="button" class="iq-work-open" data-e="open" data-id="${r[0]}">${C.escapeHTML(isAdmin?r[3]:r[1])}</button><small>${r[0]}${isPlan?' / 07 сент — '+r[4]:''}</small></div></td><td data-column="status">${U.badge(isAdmin?'Участник':info[r[2]][0],isAdmin?'neutral':info[r[2]][1])}</td><td data-column="person">${C.escapeHTML(isAdmin?'Редактор':r[3])}</td><td data-column="date">${isAdmin?'—':r[4]}</td></tr>`).join('')}</tbody></table>`:`<div class="daily-empty"><h2>Ничего не найдено</h2><p>Измените запрос или отключите фильтр.</p></div>`;
  this.querySelector('[data-e-result]').textContent=`Показано ${rows.length} из ${this.rows.length}`;
 }
 openReport(id,trigger){
  const row=this.rows.find(r=>r[0]===id),dialog=document.createElement('iq-dialog');
  dialog.innerHTML=`<div class="iq-dialog-head"><div><h2>${C.escapeHTML(row?.[1]||'Отчёт проверки')}</h2><p>Только чтение. Просмотр не принимает результат.</p></div><button type="button" class="iq-btn icon ghost sm" data-close aria-label="Закрыть">${C.icon('x',18)}</button></div><iq-markdown-viewer label="Отчёт агента"></iq-markdown-viewer><div class="iq-dialog-footer"><button type="button" class="iq-btn secondary" data-close>Закрыть</button></div>`;
  this.querySelector('.daily-dialog-slot').replaceChildren(dialog);dialog.querySelector('iq-markdown-viewer').value=report;dialog.show();
 }
 openCreate(trigger){
  const d=document.createElement('iq-dialog');d.innerHTML=`<div class="iq-dialog-head"><h2>${kinds[this.kind][1]}</h2><button type="button" class="iq-btn icon ghost sm" data-close aria-label="Закрыть">${C.icon('x',18)}</button></div><form class="stack" data-e-create-form>${U.field(this.kind==='admin'?'Имя участника':'Название','',{name:'title',required:true,max:240})}<p class="iq-helper">Изменения только в этом примере; сервер не подключён.</p><div class="iq-dialog-footer"><button type="button" class="iq-btn secondary" data-close>Отмена</button><button type="submit" class="iq-btn primary">Добавить ${C.icon('plus',16)}</button></div></form>`;this.querySelector('.daily-dialog-slot').replaceChildren(d);d.show();
  this.listen(d.querySelector('form'),'submit',e=>{e.preventDefault();const input=d.querySelector('input');if(!input.reportValidity()||!input.value.trim())return;this.rows.unshift(['SPR-'+(140+this.rows.length),input.value.trim(),'backlog','Мария Лебедева','—']);this.query='';this.filter='all';this.querySelector('[data-e-search]').value='';this.querySelector('[data-e=filter]').setAttribute('aria-pressed','false');this.renderRows();d.close();});
 }
}
class IqReadingDemo extends C.IqElement{
 mount(){
  this.innerHTML=`<div class="reading-demo"><div class="reading-demo-head"><div><span class="sample-overline">РЕЗУЛЬТАТ АГЕНТА</span><${this.hasAttribute('page')?'h1':'h2'}>Читать, не редактировать.</${this.hasAttribute('page')?'h1':'h2'}><p>Один документ и одна типографика. Без лишних элементов редактора.</p></div></div><div class="reading-controls"><div class="iq-segmented" role="group" aria-label="Способ отображения"><button type="button" data-read-mode="viewer" aria-pressed="true">Чтение</button><button type="button" data-read-mode="preview" aria-pressed="false">Preview редактора</button></div><button type="button" class="iq-btn ghost sm" data-read-empty aria-pressed="false">Пустой документ</button></div><div class="reading-paper"><iq-markdown-viewer label="Отчёт проверки"></iq-markdown-viewer><iq-markdown-editor label="Тот же документ" hidden></iq-markdown-editor></div><p class="reading-note">Просмотр не меняет статус задачи и не принимает результат агента.</p></div>`;
  this.value=report;this.viewer=this.querySelector('iq-markdown-viewer');this.editor=this.querySelector('iq-markdown-editor');this.viewer.value=this.value;this.editor.value=this.value;
  this.listen(this,'click',e=>{
   const b=e.target.closest('[data-read-mode]');if(b){const on=b.dataset.readMode==='viewer';this.viewer.hidden=!on;this.editor.hidden=on;this.querySelectorAll('[data-read-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(!on&&this.editor.querySelector('[data-md-preview]').getAttribute('aria-pressed')!=='true')this.editor.preview();}
   const empty=e.target.closest('[data-read-empty]');if(empty){const on=empty.getAttribute('aria-pressed')!=='true';empty.setAttribute('aria-pressed',String(on));this.value=on?'':report;this.viewer.value=this.value;this.editor.value=this.value;}
  });
 }
}
function registerEverydayDemo(){C.registerComponents();registerEditors();registerWorkHeader();registerWorkLayout();registerMarkdownViewer();if(!customElements.get('iq-everyday-demo'))customElements.define('iq-everyday-demo',IqEverydayDemo);if(!customElements.get('iq-reading-demo'))customElements.define('iq-reading-demo',IqReadingDemo);}
function installEverydayStories(){
 registerEverydayDemo();const {stories}=require('./stories.js');
 stories.push({id:'work-layout',category:'layout',title:'Компактный рабочий экран',description:'Проект, основное действие и рабочие строки — до первой прокрутки.',demo:()=>'<iq-everyday-demo id="catalog-work"></iq-everyday-demo>',usage:'iq-work-layout density="compact" координирует header, navigation, summary, toolbar, content и footer. Полные названия переносятся. Данные, навигацию и действия задаёт приложение. Открыть рабочий пример: workbench.html.',keyboard:'Tab — ссылки и действия. Enter — открыть запись. Плотность переключается без замены ваших элементов.'});
 stories.push({id:'markdown-viewer',category:'data',title:'Markdown для чтения',description:'Безопасное содержимое без панели и подвала редактирования.',demo:()=>'<iq-reading-demo></iq-reading-demo>',usage:'Задайте viewer.value. Тот же safeMarkdown используется в preview редактора. Исходный HTML экранируется. Разрешены HTTPS и локальные #фрагменты; изображения представлены ссылками без автоматических запросов. Код и таблицы прокручиваются внутри блока.',keyboard:'Tab — ссылки и широкие области. Стрелки — прокрутка кода и таблицы. Просмотр не отправляет событий принятия.'});
}
Object.assign(exports,{report,registerEverydayDemo,installEverydayStories});
