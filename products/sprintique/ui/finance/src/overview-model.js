/**
 * The words and figures of the finance overview (direction B2 «Шкала, тише»): the one sentence of state, money as
 * summaries show it, the period, the text of every scale and tooltip, and the plan editor's totals. Pure, so the
 * wording is testable without a browser. Amounts are integer minor units, numbers or exact decimal text.
 */
import {formatMoney,addMinor,toDecimal,fractionDigits,parseAmount} from './money.js';
import {plural} from './model.js';

const MONTHS=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const MONTHS_GENITIVE=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const big=value=>BigInt(value??0);

/** Money as the overview writes it: no «,00» on whole amounts and a typographic minus, «−120 000 ₽». */
export function money(minor,currency,{sign=false}={}){
  return formatMoney(String(minor??0),currency,{sign,whole:true}).replace(/^-/,'−').replace(/^([+])?-/,'−');
}

/** «сен — дек 2026», «ноя 2026 — фев 2027», «сентябрь 2026» when the period is one month. */
export function periodHint(from,to){
  if(!from||!to)return '';
  const [fy,fm]=from.split('-').map(Number),[ty,tm]=to.split('-').map(Number);
  if(fy===ty&&fm===tm){const name=new Date(fy,fm-1,1).toLocaleDateString('ru-RU',{month:'long'});return `${name} ${fy}`;}
  return fy===ty?`${MONTHS[fm-1]} — ${MONTHS[tm-1]} ${ty}`:`${MONTHS[fm-1]} ${fy} — ${MONTHS[tm-1]} ${ty}`;
}

/** «28 сен» for an instant in the project's time zone; the year only when it is not this one. */
export function shortDate(instant,timeZone='UTC',now=new Date()){
  const date=new Date(instant);if(Number.isNaN(date.getTime()))return '';
  const part=(value,options)=>new Intl.DateTimeFormat('en-CA',{timeZone,...options}).format(value);
  let year,month,day;try{[year,month,day]=part(date,{year:'numeric',month:'2-digit',day:'2-digit'}).split('-').map(Number);}
  catch{[year,month,day]=[date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate()];}
  const thisYear=Number((()=>{try{return part(now,{year:'numeric'});}catch{return String(now.getUTCFullYear());}})());
  return `${day} ${MONTHS[month-1]}${year===thisYear?'':' '+year}`;
}
/** «1 сен 2026» for a calendar date `YYYY-MM-DD`. */
export function dayText(day){if(!day)return '';const [y,m,d]=day.split('-').map(Number);return `${d} ${MONTHS[m-1]} ${y}`;}
/** The currency in words for the editor's note: «рубли», «доллары США», else its Russian name. */
export const currencyWords=(code,name)=>({RUB:'рубли',USD:'доллары США',EUR:'евро',CNY:'юани',KZT:'тенге',BYN:'белорусские рубли'})[code]||String(name||code).toLocaleLowerCase('ru');
/** «21 сентября» for the line under the editor. */
export const longDate=instant=>{const d=new Date(instant);return Number.isNaN(d.getTime())?'':`${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;};

/** A person as a short author: «Аня К.» from «Аня Карпова». */
export function shortName(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return parts.length>1?`${parts[0]} ${parts[1][0]}.`:parts[0]||'';
}

/** How a variance reads in words, without a sign: «выше плана на 75 000 ₽», «ниже плана на …», «по плану». */
export function varianceWords(variance,currency,direction='expense'){
  if(variance===null||variance===undefined)return '';
  const v=big(variance);if(v===0n)return 'по плану';
  // Positive is good: a saving on expense (below the plan), an excess on income (above it).
  const above=direction==='expense'?v<0n:v>0n;
  return `${above?'выше':'ниже'} плана на ${money((v<0n?-v:v).toString(),currency)}`;
}
/** The tone of a variance: success when it is good, danger when it is not, none when there is none. */
export const varianceTone=variance=>variance===null||variance===undefined||big(variance)===0n?'':big(variance)>0n?'success':'danger';

/** The currency block the sentence speaks about: the one of the detail, else the first. */
const currencyOf=(overview,code)=>overview.currencies.find(c=>c.currencyCode===code)||overview.currencies[0]||null;

/**
 * The one sentence of state, built from the server's code: «Прогноз расходов выше плана на 75 000 ₽, по категории
 * Инфраструктура объяснения нет.»
 */
export function stateSentence(overview){
  const {code,detail}=overview.state,version=overview.version;
  if(code==='no_plan')return 'Плана нет: операции видны, но отклонение оценить нельзя.';
  if(code==='not_approved'){
    if(version?.state==='draft')return `Показан черновик версии ${version.version}: план ещё не утверждён.`;
    if(version?.state==='superseded')return `Показана прежняя версия ${version.version}: так план выглядел до пересмотра.`;
    return 'План ещё не утверждён: операции видны, но отклонение оценить нельзя.';
  }
  const block=currencyOf(overview,detail?.currencyCode),currency=block?.currencyCode||'RUB';
  const variance=block?.expense?.variance??null,over=variance!==null&&big(variance)<0n;
  const head=over?`Прогноз расходов ${varianceWords(variance,currency)}`:'Прогноз расходов в пределах плана';
  if(code==='within_plan')return head+'.';
  if(code==='variance_explained')return `${head}, отклонения объяснены.`;
  const name=detail?.categoryName||'',amount=detail?money(detail.amountMinor,detail.currencyCode):'';
  if(code==='explanation_outdated')return `${head}, прогноз по категории ${name} изменился после объяснения.`;
  if(!detail)return head+'.';
  if(detail.direction==='income')return `${head}, доходы по категории ${name} ниже плана на ${amount}, объяснения нет.`;
  if(!detail.planned)return `${head}, расходов по категории ${name} не было в плане, объяснения нет.`;
  return over?`${head}, по категории ${name} объяснения нет.`:`${head}, но по категории ${name} расходы выше плана на ${amount}, объяснения нет.`;
}

/** The text equivalent of a scale for screen readers. */
export function scaleLabel({plan=null,fact,expected,forecast,variance=null,direction='expense'},currency){
  const parts=[plan===null?'плана нет':`план ${money(plan,currency)}`,`факт ${money(fact,currency)}`,`ещё ожидается ${money(expected,currency)}`,`прогноз ${money(forecast,currency)}`];
  const words=varianceWords(variance,currency,direction);
  return parts.join(', ')+(words?`: ${words}`:'')+'.';
}

/** The figures of a category's tooltip: one «label<TAB>value» line each, then who explained it, when, and the task. */
export function tooltipText(row,timeZone='UTC',now=new Date()){
  const c=row.currencyCode,lines=[];
  if(row.plan!==null)lines.push(`План\t${money(row.plan,c)}`);
  lines.push(`Факт\t${money(row.fact,c)}`,`Ещё ожидается\t${money(row.expected,c)}`,`Прогноз\t${money(row.forecast,c)}`);
  if(row.note){
    const who=[shortName(row.note.updatedBy?.name),shortDate(row.note.updatedAt,timeZone,now)].filter(Boolean).join(', ');
    lines.push([who,row.note.taskDisplayId].filter(Boolean).join(' · '));
  }
  return lines.join('\n');
}

/** «3 ожидаемые операции на 86 000 ₽ просрочены.» */
export function overdueText(count,amount,currency){
  if(!count)return '';
  const noun=plural(count,['ожидаемая операция','ожидаемые операции','ожидаемых операций']);
  return `${count} ${noun} на ${money(amount,currency)} ${count%10===1&&count%100!==11?'просрочена':'просрочены'}.`;
}

/** The container of a plan: its release, or the whole project. */
export const containerTitle=plan=>plan?.releaseName||'Весь проект';
/** The heading of the plan editor. */
export const editorTitle=plan=>plan?.releaseName?`План на релиз «${plan.releaseName}»`:'План на весь проект';

/** Options of the plan picker: each plan with its approved version, or «не утверждён». */
export function planOptions(plans){
  return plans.map(p=>({value:p.id,label:p.name,meta:p.approvedVersion?`версия ${p.approvedVersion}`:'не утверждён'}));
}

/**
 * The rows of the categories list for one currency: the server's order (the plan's lines first); without a plan,
 * the largest forecast first. Expense categories always; income ones only where the plan names them. `max` is the forecast the full track stands for when there is no plan.
 */
export function categoryRows(overview,currency){
  // The budget is about spending: income shows only where the plan has it, never as «не было в плане».
  const rows=overview.categories.filter(c=>c.currencyCode===currency&&(c.direction!=='income'||(overview.version&&c.planned)));
  if(overview.version)return {rows,max:'0'};
  const sorted=[...rows].sort((a,b)=>big(b.forecast)>big(a.forecast)?1:big(b.forecast)<big(a.forecast)?-1:0);
  const max=sorted.reduce((m,r)=>big(r.forecast)>big(m)?r.forecast:m,'0');
  return {rows:sorted,max};
}

/** Overdue expectations of one currency, both directions together, as one line. */
export function overdueOf(block){
  return {count:block?.overdue?.count||0,amount:addMinor(block?.overdue?.income||'0',block?.overdue?.expense||'0')};
}

/** Lines of the plan editor as the person typed them: rows with a category and an amount; the rest is left out. */
export function editorLines(rows,currency){
  const lines=[];
  for(const row of rows){
    const text=String(row.amount??'').trim();
    if(!row.categoryId&&!text)continue;
    if(!row.categoryId)throw Object.assign(Error('Выберите категорию строки.'),{row:row.index,field:'category'});
    if(!text)throw Object.assign(Error('Введите сумму строки или уберите её категорию.'),{row:row.index,field:'amount'});
    let amountMinor;
    if(/^0+([.,]0*)?$/.test(text.replace(/\s/g,'')))amountMinor=0;
    else{try{amountMinor=parseAmount(text,row.currencyCode||currency);}catch(error){throw Object.assign(Error(error.message),{row:row.index,field:'amount'});}}
    lines.push({direction:row.direction||'expense',categoryId:row.categoryId,amountMinor,currencyCode:row.currencyCode||currency,releaseId:row.releaseId||null,note:row.note??null});
  }
  return lines;
}
/** The total of the editor's lines in one currency, exact. */
export const editorTotal=(lines,currency)=>addMinor(...lines.filter(l=>l.currencyCode===currency&&l.direction==='expense').map(l=>String(l.amountMinor)),'0');
/** An amount for the editor's field: «1 320 000» or «1 250,50». */
export function amountText(minor,currency){
  const [whole,fraction]=toDecimal(minor,currency).split('.');
  const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  return fraction&&/[1-9]/.test(fraction)&&fractionDigits(currency)?`${grouped},${fraction}`:grouped;
}
