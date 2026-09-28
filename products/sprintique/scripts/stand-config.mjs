// The local reference stand's private settings (output/infra/stand.json, 0600): origin, database credentials and the
// mail relay. A stand created before sign-in by e-mail kept them in identity.json; its database and origin are
// reused, the Keycloak fields are ignored.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const STAND_ROOT=resolve('output/infra');
export const MAIL_DEFAULTS={smtpPort:54325,apiPort:54326,from:'Sprintique <no-reply@sprintique.localhost>'};

export async function readStand(){
  for(const file of ['stand.json','identity.json']){
    try{
      const config=JSON.parse(await readFile(STAND_ROOT+'/'+file,'utf8'));
      return {origin:config.origin,database:config.database,mail:{...MAIL_DEFAULTS,...config.mail}};
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  throw Error('No local stand settings: run `npm run local:services` first');
}

/** The newest letter Mailpit holds for an address, waiting up to ten seconds for it to arrive. */
export async function latestLetter(stand,to){
  const api=`http://127.0.0.1:${stand.mail.apiPort}/api/v1`;
  for(let attempt=0;attempt<40;attempt++){
    const found=await fetch(`${api}/search?limit=1&query=${encodeURIComponent('to:"'+to+'"')}`).then(r=>r.json());
    const id=found.messages?.[0]?.ID;
    if(id)return fetch(`${api}/message/${encodeURIComponent(id)}`).then(r=>r.json());
    await new Promise(resolveWait=>setTimeout(resolveWait,250));
  }
  throw Error('No letter reached the local mail relay for '+to);
}
