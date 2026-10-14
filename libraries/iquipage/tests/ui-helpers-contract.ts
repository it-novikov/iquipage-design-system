/** WP07/F06: the DS markup helpers typed against the call shapes Sprintique uses (web/, ui/). Typecheck-only. */
import type {ui as UI,MenuItem} from '../types/core.js';
declare const ui:typeof UI;
// Real shapes: board/task dialog/workbench buttons, icon buttons, alerts, toggles, menus, fields.
ui.btn('Посмотреть шаблон','secondary sm','','data-preview-type-template');
ui.btn('Оставить мой текст','ghost sm','','data-keep-description');
ui.btn('Сохранить','primary');ui.btn('Подробнее','link');ui.btn('Удалить','danger sm');ui.btn('Назад','ghost sm sq-footer-start');
ui.ib('x','Закрыть');ui.ib('more','Действия','ghost sm','data-more');
ui.alert('Нет доступа','Попросите доступ у администратора.','warning');
ui.toggle('Уведомления в Telegram',true,'name="telegram"');
ui.check('Включить подзадачи',false,'name="children"');
ui.field('Название','',{name:'name',required:true,max:100,placeholder:'Например, релиз 2'});
ui.textarea('Комментарий','',{name:'body',maxlength:2000});
const items:MenuItem[]=[{section:'Задача'},{label:'Переименовать',action:'rename',glyph:'edit'},{label:'Удалить',action:'delete',danger:true}];
ui.menu(ui.ib('more','Ещё'),items);
// Mistakes the types now catch.
// @ts-expect-error unknown tone
ui.btn('Сохранить','primay');
// @ts-expect-error tone is not free text
ui.alert('a','b','error');
// @ts-expect-error textarea limit is maxlength, field limit is max
ui.textarea('Комментарий','',{max:10});
// @ts-expect-error a menu item needs a label or a section
ui.menu('',[{action:'x'}]);
