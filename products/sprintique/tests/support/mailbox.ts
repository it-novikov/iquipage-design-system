// The local mail drop as a mailbox: the server writes each letter as a JSON file; tests read the newest one sent to
// an address and take the sign-in code from it.
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export interface Letter {to:string;subject:string;text:string;html?:string|null}
export interface Mailbox {directory:string;letters(to:string):Promise<Letter[]>;code(to:string):Promise<string>;close():Promise<void>}

export async function openMailbox():Promise<Mailbox>{
  const directory=await mkdtemp(join(tmpdir(),'sprintique-mail-'));
  async function letters(to:string){
    // File names start with the send time in milliseconds, so name order is send order.
    const names=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
    const all=await Promise.all(names.map(async name=>JSON.parse(await readFile(join(directory,name),'utf8')) as Letter));
    return all.filter(letter=>letter.to===to);
  }
  return {directory,letters,
    async code(to){
      const last=(await letters(to)).at(-1);if(!last)throw Error('No letter to '+to);
      const match=last.text.match(/код для входа в Sprintique: (\d{6})/);if(!match)throw Error('No code in the letter');
      return match[1]!;
    },
    async close(){await rm(directory,{recursive:true,force:true});}};
}
