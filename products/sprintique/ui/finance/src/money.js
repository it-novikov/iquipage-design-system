/** Money of the finance section: integer minor units of an ISO 4217 currency, exact at every step. Pure helpers. */
export const MAX_AMOUNT_MINOR=999_999_999_999_999;
/** Currencies offered first; any other ISO code an entry already uses is offered too. */
export const COMMON_CURRENCIES=['RUB','USD','EUR','CNY','KZT','BYN','GBP','AED','TRY','GEL','AMD','UZS'];
/** Every ISO 4217 code the browser knows, the common ones first; the common list alone where it knows none. */
export function currencyCodes(...extra){
  let all=[];try{all=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('currency'):[];}catch{all=[];}
  return [...new Set([...extra.filter(Boolean),...COMMON_CURRENCIES,...all.filter(code=>/^[A-Z]{3}$/.test(code)).sort()])];
}

/**
 * ISO 4217 minor-unit exponents that are not 2. The table is fixed, not taken from the browser: locale data (CLDR)
 * differs from ISO for some currencies (IQD, RSD, LBP…) and between browsers, and `amount_minor` must mean the same
 * amount in every client, in the importer and on the server.
 */
const ISO_EXPONENTS={BHD:3,IQD:3,JOD:3,KWD:3,LYD:3,OMR:3,TND:3,CLF:4,UYW:4,
  BIF:0,CLP:0,DJF:0,GNF:0,ISK:0,JPY:0,KMF:0,KRW:0,PYG:0,RWF:0,UGX:0,UYI:0,VND:0,VUV:0,XAF:0,XOF:0,XPF:0};
/** Digits after the decimal point for a currency by ISO 4217 (RUB 2, JPY 0, KWD 3). */
export const fractionDigits=currency=>ISO_EXPONENTS[currency]??2;
/** The currency's sign or code in Russian: ₽, $, €; the code itself when there is no sign. */
export function currencySymbol(currency){
  try{return new Intl.NumberFormat('ru-RU',{style:'currency',currency,currencyDisplay:'narrowSymbol'}).formatToParts(0).find(p=>p.type==='currency')?.value||currency;}
  catch{return currency;}
}
/** The Russian name of a currency for pickers: «Российский рубль». */
export function currencyName(currency){
  try{const name=new Intl.DisplayNames(['ru'],{type:'currency'}).of(currency);return name&&name!==currency?name[0].toUpperCase()+name.slice(1):currency;}
  catch{return currency;}
}

/**
 * Reads an amount a person typed ("1 250,50", "1250.5", "1 250") into minor units. Throws a Russian message for
 * anything that is not a positive amount the currency can hold.
 */
export function parseAmount(text,currency){
  const digits=fractionDigits(currency);
  const value=String(text??'').replace(/[\s  ]/g,'').replace(',','.');
  if(!value)throw Error('Введите сумму.');
  const match=/^(\d+)(?:\.(\d*))?$/.exec(value);
  if(!match)throw Error('Сумма — это число, например 1 250,50.');
  const whole=match[1].replace(/^0+(?=\d)/,''),fraction=match[2]??'';
  if(fraction.length>digits)throw Error(digits?`После запятой не больше ${digits} ${digits===1?'знака':'знаков'}.`:'Эта валюта не делится на копейки.');
  const minor=BigInt(whole)*10n**BigInt(digits)+BigInt((fraction+'0'.repeat(digits)).slice(0,digits)||'0');
  if(minor<1n)throw Error('Сумма должна быть больше нуля.');
  if(minor>BigInt(MAX_AMOUNT_MINOR))throw Error('Слишком большая сумма.');
  return Number(minor);
}
/** Minor units (a number or exact decimal text) as a plain decimal string: "125050" in RUB → "1250.50". */
export function toDecimal(minor,currency){
  const digits=fractionDigits(currency),value=BigInt(minor),negative=value<0n,abs=negative?-value:value;
  const text=abs.toString().padStart(digits+1,'0'),whole=text.slice(0,text.length-digits)||'0',fraction=text.slice(text.length-digits);
  return (negative?'-':'')+whole+(digits?'.'+fraction:'');
}
/** An amount for a form field: "1250,50". */
export const amountInput=(minor,currency)=>toDecimal(minor,currency).replace('.',',');
/**
 * Minor units as money in Russian: "1 250,50 ₽". `sign` adds an explicit plus for positive values; the minus of a
 * negative value is always shown. Exact beyond 2^53: the browser formats the decimal text itself.
 */
export function formatMoney(minor,currency,{sign=false,whole=false}={}){
  const decimal=toDecimal(minor,currency);
  try{
    // whole: an amount without a fractional part reads without «,00», as summaries show it.
    const digits=whole&&/\.0+$|^-?\d+$/.test(decimal)?0:fractionDigits(currency);
    const format=new Intl.NumberFormat('ru-RU',{style:'currency',currency,currencyDisplay:'narrowSymbol',signDisplay:sign?'exceptZero':'auto',minimumFractionDigits:digits,maximumFractionDigits:digits});
    return format.format(/** @type {any} */(digits?decimal:decimal.replace(/\.0+$/,'')));
  }catch{return `${decimal.replace('.',',')} ${currency}`;}
}
/** Signed amount of an entry: income adds, expense subtracts. */
export const signedAmount=entry=>(entry.direction==='expense'?'-':'')+String(entry.amountMinor);
/** Sum of decimal minor texts, exact. */
export const addMinor=(...values)=>values.reduce((total,value)=>total+BigInt(value||0),0n).toString();
