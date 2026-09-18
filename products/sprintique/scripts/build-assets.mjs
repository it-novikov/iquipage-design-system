import {cp,mkdir} from 'node:fs/promises';
// The compiled migrator resolves SQL relative to build/backend, not the source tree.
await mkdir('build/migrations',{recursive:true});
await cp('migrations','build/migrations',{recursive:true});
