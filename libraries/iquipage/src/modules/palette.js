"use strict";
const {escapeHTML: esc} = require('./components.js');
const {badge, btn} = require('./ui.js');
/** The studio renders the same manifest used to generate production variables. */
function paletteView(tokens) {
  const groups = [
    ['Сигнальные цвета', ['danger-fill','success-fill','warning-fill','planned-fill','info-fill','neutral-fill']],
    ['Рабочие поверхности', ['canvas','surface','raised','recessed','field-bg','hover']],
    ['Текст и границы', ['ink','muted','subtle','line','control','line-strong']],
    ['Действия и фокус', ['primary','on-primary','accent','accent-fill','focus-fill','focus-text','menu-focus']],
    ['Световые акценты / внутренний слой', ['task-light-critical-core','task-light-critical-mid','task-light-critical-rim','task-light-high-core','task-light-high-mid','task-light-high-rim','task-light-epic-core','task-light-epic-mid','task-light-epic-rim']],
    ['Акценты задач', ['task-critical-surface','task-high-surface','task-epic-surface','task-critical-text','task-high-text','task-epic-text']],
    ['Компоненты', ['sample-bg','sample-ink','priority-neutral-bg','priority-neutral-ink','avatar-more','on-avatar-more','epic','card-accent-critical','card-accent-high','card-accent-epic']]
  ];
  const names = {'danger-fill':'Ошибка','success-fill':'Готово','warning-fill':'Требует решения','planned-fill':'Запланировано','info-fill':'Информация','neutral-fill':'Черновик','canvas':'Холст','surface':'Поверхность','raised':'Поднятый слой','recessed':'Углублённый слой','ink':'Основной текст','muted':'Вторичный текст','primary':'Основное действие','epic':'Эпик'};
  const swatch = key => `<article class="palette-swatch"><div class="palette-pigment" style="background:var(--iq-${key})" aria-hidden="true"></div><div><h3>${esc(names[key] || key)}</h3><code>--iq-${esc(key)}</code><dl><div><dt>Светлая</dt><dd>${esc(tokens.light[key])}</dd></div><div><dt>Тёмная</dt><dd>${esc(tokens.dark[key])}</dd></div></dl></div></article>`;
  const rows = Object.keys(tokens.light).filter(key=>/^#[0-9a-f]{3,8}$/i.test(tokens.light[key])).sort();
  return `<span class="sample-overline">ЦВЕТ / ЕДИНЫЙ ИСТОЧНИК</span><h1>Палитра, которая<br>держит систему.</h1><p class="rules-lead">Состояния, поверхности и текст используют именованные роли. Значения в каталоге и в интерфейсе берутся из одного файла.</p><div class="palette-states">${badge('Ошибка','danger')}${badge('Готово','success')}${badge('Требует решения','warning')}${badge('Запланировано','planned')}</div><div class="palette-principle"><b>Нефритовый — #2CB88A</b><p>Общий зелёный для заливок и сигналов. На светлой поверхности текстовое подтверждение использует более тёмный оттенок той же роли, чтобы не терять читаемость. Красный сохранён; оранжевый — #FFB343. Активная работа обозначена синим, планирование — более тёплым, орхидейным фиолетовым.</p></div>${groups.map(([title,keys])=>`<section class="palette-section"><h2>${title}</h2><div class="palette-grid">${keys.map(swatch).join('')}</div></section>`).join('')}<section class="palette-section"><h2>Все цветовые токены</h2><p class="rules-copy">${rows.length} ролей в каждой теме, включая цвета текста на заливках и служебных элементов. В архиве также есть реестр цветов графики и составных эффектов.</p><details class="palette-all"><summary>Открыть полный реестр цветов</summary><div class="palette-table-wrap" tabindex="0" aria-label="Таблица цветовых токенов"><table class="palette-table"><caption class="sr-only">Светлая и тёмная темы</caption><thead><tr><th>Токен</th><th>Светлая</th><th>Тёмная</th></tr></thead><tbody>${rows.map(k=>`<tr><th scope="row"><code>--iq-${esc(k)}</code></th><td><span style="--swatch:${tokens.light[k]}" class="palette-inline"></span><code>${tokens.light[k]}</code></td><td><span style="--swatch:${tokens.dark[k]}" class="palette-inline"></span><code>${tokens.dark[k]}</code></td></tr>`).join('')}</tbody></table></div></details></section>${btn('Скачать палитру и токены','secondary','download','data-export-tokens')}`;
}
exports.paletteView = paletteView;

