// Pure presentation rules of notifications (docs/decisions/0006-notifications-telegram.md, 0007-notification-channels.md):
// the bell's count, a row's facts, the channel lines. No DOM, no network: the bell, the settings and their tests share these.
import {ageLabel,plural} from './workbench/model.js';

/** The bell's count: nothing at zero, 99+ beyond. */
export function badgeText(unread){const n=Math.max(0,Math.floor(Number(unread)||0));return n===0?'':n>99?'99+':String(n);}

/** The bell's accessible name: the count is read out, never shown only as a number. */
export function bellLabel(unread){
  const n=Math.max(0,Math.floor(Number(unread)||0));
  return n===0?'Уведомления':`Уведомления: ${n} ${plural(n,'непрочитанное','непрочитанных','непрочитанных')}`;
}

/** The quiet line of a row: who did it, the project and how long ago. */
export function rowMeta(item,now=Date.now()){return [item.author,item.project?.name,ageLabel(item.createdAt,now)].filter(Boolean).join(' · ');}

/**
 * How a quick action is taken back from the toast, through the ordinary write it undoes (docs/decisions/0007): the
 * task's previous status, the request reopened, the previous due date. Null when there is nothing to undo.
 */
export function undoRequest(item,undo){
  if(!undo||!item?.project?.id)return null;
  const project='/projects/'+encodeURIComponent(item.project.id);
  if(undo.kind==='status')return {path:`${project}/tasks/${encodeURIComponent(item.task.id)}/position`,method:'PATCH',body:{baseRevision:undo.revision,status:undo.status,rank:undo.rank}};
  if(undo.kind==='reopen')return {path:`${project}/requests/${encodeURIComponent(undo.requestId)}/reopen`,method:'POST',body:{baseRevision:undo.revision}};
  if(undo.kind==='due'&&undo.due)return {path:`/notifications/${encodeURIComponent(item.id)}/actions`,method:'POST',body:{action:'postpone',due:undo.due}};
  return null;
}

/** The glyph of a notification without a person (a deadline). */
export const kindGlyph=kind=>({deadline:'flag',request:'help',mention:'message',assigned:'user'})[kind]||'bell';

/** The kinds a person chooses for e-mail and Telegram, in the order the settings list them. */
export const NOTIFICATION_KINDS=[
  {kind:'assigned',title:'Назначения',hint:'Кто-то другой назначил вас исполнителем задачи.'},
  {kind:'mention',title:'Упоминания',hint:'Вас упомянули в обсуждении: выбрали в списке после @ или написали @Имя.'},
  {kind:'request',title:'Запросы',hint:'Вас попросили проверить, ответить, решить или сделать.'},
  {kind:'deadline',title:'Сроки',hint:'Срок вашей задачи — завтра или сегодня. Приходит в 9:00 по вашему времени.'}
];

/** The Telegram row: connected as whom, or what to do. Null when the server has no bot. */
export function telegramStatus(telegram){
  if(!telegram?.available)return null;
  const connection=telegram.connection;
  if(!connection)return {connected:false,meta:'Не подключён. Откроется чат с ботом: нажмите «Запустить», и уведомления будут приходить туда.'};
  return {connected:true,meta:(connection.username?`Подключён как @${connection.username}. `:'Подключён. ')+'Отключить можно здесь или командой /stop в чате.'};
}

/** The e-mail row: the account's address, read-only. Null when the server sends no notification letters or there is no address. */
export function emailStatus(email){
  if(!email?.available||!email.address)return null;
  return {address:email.address,meta:'Адрес вашего аккаунта.'};
}

/** Whether there is anywhere to send outside the product: then the kinds are chosen. */
export const hasChannels=settings=>Boolean(emailStatus(settings?.email)||telegramStatus(settings?.telegram));
