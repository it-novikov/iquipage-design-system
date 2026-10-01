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

/** The second line of a row: the project and how long ago. */
export function rowMeta(item,now=Date.now()){return [item.project?.name,ageLabel(item.createdAt,now)].filter(Boolean).join(' · ');}

/** The glyph of a notification without a person (a deadline). */
export const kindGlyph=kind=>({deadline:'flag',request:'help',mention:'message',assigned:'user'})[kind]||'bell';

/** The kinds a person chooses for e-mail and Telegram, in the order the settings list them. */
export const NOTIFICATION_KINDS=[
  {kind:'assigned',title:'Назначения',hint:'Кто-то другой назначил вас исполнителем задачи.'},
  {kind:'mention',title:'Упоминания',hint:'Вас упомянули в обсуждении: @Имя или @Имя Фамилия.'},
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
  return {address:email.address,meta:'Адрес вашего аккаунта. Всё, что набралось за несколько минут, приходит одним письмом.'};
}

/** Whether there is anywhere to send outside the product: then the kinds are chosen. */
export const hasChannels=settings=>Boolean(emailStatus(settings?.email)||telegramStatus(settings?.telegram));
