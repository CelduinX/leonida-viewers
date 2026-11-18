import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import {openDatabase,log} from './runtime.mjs';
import {startMonitor} from './monitor.mjs';
import worker from '../dist/server/index.js';
const db=await openDatabase(process.env,{migrate:process.env.AUTO_MIGRATE!=='false'});
const env={...process.env,DB:db};
const pending=new Set();
const ctx={waitUntil(p){pending.add(p);p.catch(e=>console.error('Background collection failed:',e.name)).finally(()=>pending.delete(p));}};
const monitor=process.env.MONITOR_MODE==='external'?null:startMonitor(env);
const server=createServer(async(req,res)=>{
  try{
    if(Number(req.headers['content-length'])>210000){res.writeHead(413);res.end('Request too large');return;}
    const controller=new AbortController();req.on('aborted',()=>controller.abort());
    // Do not trust client-supplied proxy IP headers on the local Node adapter.
    const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');
    let body;
    if(!['GET','HEAD'].includes(req.method)){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>210000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);
    }
    const request=new Request(`http://${req.headers.host||'localhost'}${req.url}`,{method:req.method,headers,body,signal:controller.signal});
    const response=await worker.fetch(request,env,ctx);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch(e){if(!res.headersSent)res.writeHead(500);res.end('Server error');console.error(e.name);}
});
server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
const port=Number(process.env.PORT)||3000,host=process.env.HOST||'127.0.0.1';
server.on('error',e=>{log('http_server_error',{code:e.code});void shutdown();});
server.listen(port,host,()=>console.log(`Leonida Viewers ready at http://${host}:${port}`));
let closing=false;
async function shutdown(){if(closing)return;closing=true;server.close();await monitor?.stop();await Promise.allSettled([...pending]);await db.close();process.exit(process.exitCode||0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
