import fs from 'node:fs/promises';
import ts from 'typescript';
import { createHash } from 'node:crypto';
await fs.mkdir('dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
await fs.mkdir('dist/client',{recursive:true});
function compile(text){return ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}}).outputText;}
const assets={};
for(const [path,file,type]of [
  ['/','public/index.html','text/html; charset=utf-8'],
  ['/assets/style.css','public/style.css','text/css; charset=utf-8'],
  ['/assets/client.js','src/client.ts','text/javascript; charset=utf-8'],
  ['/assets/demo.js','src/demo.ts','text/javascript; charset=utf-8'],
]){
  let body=await fs.readFile(file,'utf8');if(file.endsWith('.ts'))body=compile(body);
  assets[path]={body,type,etag:'"'+createHash('sha256').update(body).digest('hex').slice(0,20)+'"'};
  if(path.startsWith('/assets/'))await fs.writeFile(`dist/client/${path.split('/').at(-1)}`,body);
}
assets['/favicon.svg']={body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#17121f"/><g fill="#bca0ff" transform="skewY(-12)"><rect x="14" y="25" width="9" height="28" rx="3"/><rect x="28" y="16" width="9" height="37" rx="3"/><rect x="42" y="34" width="9" height="19" rx="3"/></g></svg>',type:'image/svg+xml',etag:'"leonida-1"'};
const server=compile(await fs.readFile('src/server.ts','utf8'));
const wrapper=`
const ASSETS=${JSON.stringify(assets)};
const SECURITY={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'"
};
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response;
    try{
      if(url.pathname.startsWith('/api/'))response=await api(request,env,ctx);
      else{
        const asset=ASSETS[url.pathname];
        if(!asset)response=new Response('Nicht gefunden',{status:404});
        else if(!['GET','HEAD'].includes(request.method))response=new Response('Methode nicht erlaubt',{status:405});
        else if(request.headers.get('If-None-Match')===asset.etag)response=new Response(null,{status:304,headers:{ETag:asset.etag}});
        else response=new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,ETag:asset.etag,'Cache-Control':'public, max-age=0, must-revalidate'}});
      }
    }catch(error){
      console.error('Request failed:',error instanceof Error?error.name:'Unknown error');
      response=new Response(JSON.stringify({error:'Serverfehler. Bitte später erneut versuchen.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
    const headers=new Headers(response.headers);for(const [k,v]of Object.entries(SECURITY))headers.set(k,v);
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(collect(env));}
};
`;
await fs.writeFile('dist/server/index.js',server+wrapper);
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built browser assets and shared collector. PostgreSQL adapter is loaded only by Node.');
