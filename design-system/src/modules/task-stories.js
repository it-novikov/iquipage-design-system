"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installTaskStories = installTaskStories;
const stories_js_1 = require("./stories.js");
const priority_js_1 = require("./priority.js");
const taskKind = require('./task-kind.js');
const ui_js_1 = require("./ui.js");
function installTaskStories() {
    const card = (priority, kind, title, id) => `<article class="task-card" data-priority="${priority}" data-task-kind="${kind}" data-task-emphasis="${taskKind.taskEmphasis({priority,type:kind})}"><div class="task-card-top"><div class="task-identity"><span class="task-card-id">${id}</span>${taskKind.taskSignal({priority,type:kind})}</div></div><div class="task-card-title">${title}</div><div class="task-card-footer"><span class="task-due">18 сентября</span><span class="iq-avatar v1">АК</span></div></article>`;
    stories_js_1.stories.push({id:'priority',category:'data',title:'Приоритет задачи',description:'Четыре равных метки. Тип задачи и срочность не смешиваются.',usage:'Метки имеют одинаковые размеры без иконок. Мягкий свет внутри карточки подчинён одному сигналу: критический, высокий или эпик. Обычные задачи остаются нейтральными, независимо от статуса. При сочетании типа эпик и высокого приоритета побеждает приоритет; тип остаётся текстовой подписью. В плане приоритет не выводится.',keyboard:'Tab — поле. Стрелки — выбрать, Enter — подтвердить.',demo:()=>`<div class="priority-catalog"><div class="priority-badges">${Object.keys(priority_js_1.priorities).map(p=>priority_js_1.priorityBadge(p)).join('')}</div><div class="priority-specimen"><div><span class="sample-overline">ОДИН АКЦЕНТ — ОДНО ЗНАЧЕНИЕ</span><h3>Внимание без лишнего шума.</h3><p>Рассеянный свет обозначает важность, короткая подпись объясняет её. Без левой полосы, пульсации и цвета на каждой задаче.</p>${ui_js_1.select('Приоритет',priority_js_1.priorityOptions(),'value="critical" data-priority-demo')}</div><div data-priority-demo-root>${card('critical','task','Проверить доступность нового релиза','SPR–128').replace('class="task-card"','class="task-card" data-priority-demo-card')}</div></div><div class="priority-card-gallery">${card('high','task','Согласовать материалы выпуска','SPR–129')}${card('normal','epic','Подготовить цифровой паспорт изделия','SPR–131')}${card('critical','epic','Проверить доступ к проектам','SPR–140')}</div><p class="iq-helper">Статичные образцы. Рабочие карточки с перетаскиванием — в разделе «Примеры → Приложение».</p></div>`});
    document.addEventListener('iq-change',event=>{
      if (!event.target?.hasAttribute('data-priority-demo')) return;
      const card = document.querySelector('[data-priority-demo-card]');
      if (card) {card.dataset.priority = priority_js_1.normalizePriority(event.detail.value);card.dataset.taskEmphasis = taskKind.taskEmphasis({priority:event.detail.value,type:card.dataset.taskKind});card.querySelector('.task-signal-copy').outerHTML = taskKind.taskSignal({priority:event.detail.value,type:card.dataset.taskKind});}
    });
}

