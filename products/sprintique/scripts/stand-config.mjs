// The local reference stand's private settings (output/infra/stand.json, 0600): origin, database credentials and the
// mail relay, written by `npm run local:services`.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const STAND_ROOT=resolve('output/infra');
export const MAIL_DEFAULTS={smtpPort:54325,apiPort:54326,from:'Sprintique <no-reply@sprintique.localhost>'};

export async function readStand(){
  let config;
  try{config=JSON.parse(await readFile(STAND_ROOT+'/stand.json','utf8'));}
  catch(error){if(error.code==='ENOENT')throw Error('No local stand settings: run `npm run local:services` first');throw error;}
  return {origin:config.origin,database:config.database,mail:{...MAIL_DEFAULTS,...config.mail}};
}

/** The id of the newest letter Mailpit holds for an address, if any. */
export async function newestLetterId(stand,to){
  const api=`http://127.0.0.1:${stand.mail.apiPort}/api/v1`;
  const found=await fetch(`${api}/search?limit=1&query=${encodeURIComponent('to:"'+to+'"')}`).then(r=>r.json());
  return found.messages?.[0]?.ID;
}

/** The newest letter for an address other than `previous`, waiting up to ten seconds for it to arrive. */
export async function latestLetter(stand,to,previous){
  const api=`http://127.0.0.1:${stand.mail.apiPort}/api/v1`;
  for(let attempt=0;attempt<40;attempt++){
    const id=await newestLetterId(stand,to);
    if(id&&id!==previous)return fetch(`${api}/message/${encodeURIComponent(id)}`).then(r=>r.json());
    await new Promise(resolveWait=>setTimeout(resolveWait,250));
  }
  throw Error('No letter reached the local mail relay for '+to);
}
