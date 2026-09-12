/** Local static fixture server. Explicit allowlist, loopback only, no write/API endpoints. */
import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const allowed=['packages/work-list/dist/','packages/work-list/src/work-list.css','packages/planning/src/','packages/planning/demo/','packages/maps/src/','packages/maps/dist/vendor/'];
export function startServer(port=0){
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
      const url=new URL(req.url,'http://127.0.0.1');let name=decodeURIComponent(url.pathname).replace(/^\//,'');
      if(name===''||name==='index.html')name='packages/planning/demo/index.html';
      if(!allowed.some(p=>name.startsWith(p))||name.split('/').includes('..')){res.writeHead(404).end();return;}
      const file=await realpath(path.join(root,name));if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
      let data=await readFile(file);
      if(name.endsWith('demo/index.html'))data=Buffer.from(data.toString().replace('href="../src/planning.css"','href="/packages/planning/src/planning.css"').replace('href="./shell.css"','href="/packages/planning/demo/shell.css"').replace('src="./app.js"','src="/packages/planning/demo/app.js"'));
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404).end();}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve({server,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(done=>server.close(done))}));});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {url}=await startServer(Number(process.env.PORT||4328));console.log('Planning fixture: '+url);}
