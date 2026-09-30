/** Invitation rules the page needs before the server answers. Pure: no DOM, tested in node. */
export const MAX_ADDRESSES=20;
/** One address, as the server accepts it: a local part, @, a domain with a dot. */
export const validEmail=value=>/^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/.test(value)&&value.length<=254;
/** Why an address is not accepted, in words; '' when it is. */
export function emailProblem(value){
  if(validEmail(value))return '';
  if(!value.includes('@'))return 'нет символа @';
  if(!/@[^@]+\.[^@.]{2,}$/.test(value))return 'без домена';
  return 'проверьте написание';
}
/** A pasted list: split by commas, spaces, new lines and semicolons; «Имя <адрес>» keeps the address; no repeats. */
export function splitAddresses(text,existing=[]){
  const seen=new Set(existing.map(a=>a.toLocaleLowerCase('en'))),out=[];
  const parts=String(text).split(/[,;\n]+/).flatMap(chunk=>{const named=chunk.match(/<([^<>]+)>/);return named?[named[1]]:chunk.split(/\s+/);});
  for(const part of parts){
    const value=part.trim().replace(/^mailto:/i,'');if(!value)continue;
    const key=value.toLocaleLowerCase('en');if(seen.has(key))continue;seen.add(key);out.push(value);
  }
  return out;
}
const expired=i=>i.state==='expired'||i.state==='pending'&&new Date(i.expiresAt)<=new Date();
/** Waiting for an answer (and can be sent again) versus finished (accepted, cancelled, replaced by a new letter). */
export const isWaiting=i=>i.state==='pending'||i.state==='expired';
/** The badge of an invitation: [label, DS tone]. */
export function invitationBadge(i){
  if(i.state==='accepted')return ['Принято','success'];
  if(i.state==='revoked')return ['Отменено','neutral'];
  if(i.state==='replaced')return ['Заменено','neutral'];
  if(expired(i))return ['Истекло','neutral'];
  if(i.kind==='link')return ['Активна','info'];
  if(i.delivery==='failed')return ['Не отправлено','danger'];
  if(i.delivery==='sent')return ['Отправлено','info'];
  return ['Отправляется','neutral'];
}
export const workspaceRoleNames={owner:'Владелец',admin:'Администратор',member:'Участник',guest:'Гость'};
/** When «Отправить снова» becomes available: null when it never will (links, finished), a Date otherwise. */
export const resendableAt=i=>i.resendableAt?new Date(i.resendableAt):null;
const phrase=items=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' и '+items.at(-1);
const day=value=>value?new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'';
/** What an invitation gives, in one sentence for the recipient. */
export function invitationSummary(i){
  const role=(workspaceRoleNames[i.workspaceRole]||'участник').toLocaleLowerCase('ru'),names=(i.projectNames||[]).map(n=>`«${n}»`);
  return `Роль — ${role} пространства.${names.length?` ${names.length>1?'Проекты':'Проект'}: ${phrase(names)}${i.presetName?`, пресет «${i.presetName}»`:''}.`:''}`;
}
/** A link that no longer invites: a title and what to do, for the sign-in screen and the signed-in dialog. */
export function invitationState(state,i={}){
  const who=i.inviterName||'тот, кто вас пригласил';
  return ({
    expired:['Ссылка устарела',`Приглашение${i.workspaceName?` в «${i.workspaceName}»`:''} действовало${i.expiresAt?` до ${day(i.expiresAt)}`:''}. Новое приглашение отправит ${who} — это одна кнопка в списке приглашений.`],
    revoked:['Приглашение отменено','Приглашение больше не действует: его отменили или у автора больше нет права приглашать. Если это ошибка, попросите пригласить вас снова.'],
    replaced:['Ссылка заменена','Вам отправили новое письмо с приглашением: откройте ссылку из него. Эта ссылка больше не работает.'],
    accepted:['Приглашение уже принято','По этой ссылке уже присоединились. Если это были вы, проекты уже в вашем списке.'],
  })[state]||['Ссылка не работает','Проверьте, что ссылка скопирована целиком, или попросите пригласить вас снова.'];
}
/** Error codes of accept that mean the link no longer invites, as the state they describe. */
export const goneState=code=>({INVITATION_EXPIRED:'expired',INVITATION_REVOKED:'revoked',INVITATION_REPLACED:'replaced',INVITATION_USED:'accepted',INVITATION_INVALID:'invalid'})[code]||'';
export const INVITATION_TOKEN=/^#invite\/(invite_[A-Za-z0-9_-]{43})$/;
