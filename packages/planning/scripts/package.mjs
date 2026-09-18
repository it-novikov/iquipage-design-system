import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=[fileURLToPath(new URL('./package.py',import.meta.url)),...process.argv.slice(2)];
const result=spawnSync('python3',args,{stdio:'inherit'});if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
