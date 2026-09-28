/** Money of the finance section: integer minor units of an ISO 4217 currency, exact at every step. Pure helpers. */
export const MAX_AMOUNT_MINOR=999_999_999_999_999;
/** Currencies offered first; any other ISO code an entry already uses is offered too. */
export const COMMON_CURRENCIES=['RUB','USD','EUR','CNY','KZT','BYN','GBP','AED','TRY','GEL','AMD','UZS'];

/** Digits after the decimal point for a currency (RUB 2, JPY 0, KWD 3), as the browser knows them. */
export function fractionDigits(currency){
  try{return new Intl.NumberFormat('ru-RU',{style:'currency',currency}).resolvedOptions().maximumFractionDigits??2;}
  catch{return 2;}
}
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
export function formatMoney(minor,currency,{sign=false}={}){
  const decimal=toDecimal(minor,currency);
  try{
    const format=new Intl.NumberFormat('ru-RU',{style:'currency',currency,currencyDisplay:'narrowSymbol',signDisplay:sign?'exceptZero':'auto'});
    return format.format(/** @type {any} */(decimal));
  }catch{return `${decimal.replace('.',',')} ${currency}`;}
}
/** Signed amount of an entry: income adds, expense subtracts. */
export const signedAmount=entry=>(entry.direction==='expense'?'-':'')+String(entry.amountMinor);
/** Sum of decimal minor texts, exact. */
export const addMinor=(...values)=>values.reduce((total,value)=>total+BigInt(value||0),0n).toString();
