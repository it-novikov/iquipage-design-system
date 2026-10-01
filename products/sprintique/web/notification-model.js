// Pure presentation rules of notifications (docs/decisions/0006-notifications-telegram.md): the bell's count, a
// row's facts, the Telegram status line. No DOM, no network: the bell, the settings and their tests share these.
import {ageLabel,plural} from './workbench/model.js';

/** The bell's count: nothing at zero, 99+ beyond. */
export function badgeText(unread){const n=Math.max(0,Math.floor(Number(unread)||0));return n===0?'':n>99?'99+':String(n);}

/** The bell's accessible name: the count is read out, never shown only as a number. */
export function bellLabel(unread){
  const n=Math.max(0,Math.floor(Number(unread)||0));
  return n===0?'Уведомления':`Уведомления: ${n} ${plural(n,'непрочитанное','непрочитанных','непрочитанных')}`;
}

/** The second line of a row: the project and how long ago. */
export function rowMeta(item,now=Date.now()){return [item.project?.name,ageLabel(item.createdAt,now)].filter(Boolean).join(' · ');}

/** The glyph of a notification without a person (a deadline). */
export const kindGlyph=kind=>({deadline:'flag',request:'help',mention:'message',assigned:'user'})[kind]||'bell';

/** The kinds a person chooses for Telegram, in the order the settings list them. */
export const TELEGRAM_KINDS=[
  {kind:'assigned',title:'Назначения',hint:'Кто-то другой назначил вас исполнителем задачи.'},
  {kind:'mention',title:'Упоминания',hint:'Вас упомянули в обсуждении: @Имя или @Имя Фамилия.'},
  {kind:'request',title:'Запросы',hint:'Вас попросили проверить, ответить, решить или сделать.'},
  {kind:'deadline',title:'Сроки',hint:'Срок вашей задачи — завтра или сегодня. Приходит в 9:00 по вашему времени.'}
];

/** The Telegram row: connected as whom, or what to do. */
export function telegramStatus(telegram){
  if(!telegram?.available)return null;
  const connection=telegram.connection;
  if(!connection)return {connected:false,title:'Telegram не подключён',meta:'Откроется чат с ботом. Нажмите «Запустить» — и уведомления начнут приходить туда.'};
  return {connected:true,title:connection.username?`Подключён как @${connection.username}`:'Подключён',meta:'Уведомления приходят в этот чат. Отключить можно здесь или командой /stop в чате.'};
}
