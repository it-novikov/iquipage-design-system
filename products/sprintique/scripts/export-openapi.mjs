import {mkdir,writeFile} from 'node:fs/promises';
import {Database} from '../build/backend/infrastructure/database.js';
import {createApp} from '../build/backend/http/app.js';
// Route registration is database-independent. No connection or credential is used for documentation.
const db=new Database('postgresql://unused@127.0.0.1:1/unused'),app=await createApp({db,origin:'http://localhost'});
try{const response=await app.inject('/openapi.json');if(response.statusCode!==200)throw Error('OpenAPI export failed');await mkdir('dist',{recursive:true});await writeFile('dist/openapi.json',JSON.stringify(response.json(),null,2)+'\n');console.log('Exported live route inventory: dist/openapi.json');}
finally{await app.close();await db.close();}
