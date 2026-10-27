import http from 'node:http';
import {readFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
// Development-only comparison server: one egress budget covers page and workers.
// node workbench/scripts/serve-startup-comparison.mjs <baseline> <candidate> [port] [bytes/s] [latency-ms]
const [baselineDirectory,candidateDirectory,port='4176',rate='5000000',delay='40']=process.argv.slice(2);
if(!baselineDirectory || !candidateDirectory)throw Error('Supply both static directories');
const base=path.resolve(baselineDirectory),candidate=path.resolve(candidateDirectory);
const bytesPerSecond=Number(rate),latency=Number(delay),active=[];
if(!(bytesPerSecond>0) || !(latency>=0))throw Error('Invalid network conditions');
let tokens=0,last=performance.now();
// One shared egress budget covers page AND worker requests. Per-target browser
// throttling can miss worker fetches and produce misleading comparisons.
setInterval(()=>{
 const now=performance.now();tokens=Math.min(131072,tokens+(now-last)*bytesPerSecond/1000);last=now;
 while(active.length && tokens>=1){const item=active.shift();if(item.res.destroyed)continue;
 const n=Math.min(16384,Math.floor(tokens),item.data.length-item.offset);tokens-=n;
 item.res.write(item.data.subarray(item.offset,item.offset+n));item.offset+=n;
 if(item.offset===item.data.length)item.res.end();else active.push(item);}
},4);
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');const root=u.pathname.startsWith('/candidate/')?candidate:base;
 const rel=u.pathname.replace(/^\/(candidate|baseline)\//,'');const file=path.resolve(root,rel||'index.html');
 if(!file.startsWith(root+path.sep))throw Error();const data=await readFile(file);
 if(process.env.LJ_STARTUP_REQUEST_LOG)await appendFile(process.env.LJ_STARTUP_REQUEST_LOG,JSON.stringify({at:Date.now(),path:u.pathname,bytes:data.length})+'\n');
 setTimeout(()=>{res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'public, max-age=3600'});if(!data.length)res.end();else active.push({res,data,offset:0});},latency);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(port),'127.0.0.1',()=>console.log(`Shared ${bytesPerSecond} bytes/s, ${latency} ms: http://127.0.0.1:${port}/baseline/`));
