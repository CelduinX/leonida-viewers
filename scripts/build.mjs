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
  ['/assets/theme.js','src/theme.ts','text/javascript; charset=utf-8'],
  ['/site.webmanifest','public/site.webmanifest','application/manifest+json; charset=utf-8'],
  ['/favicon.svg','public/favicon.svg','image/svg+xml'],
  ['/assets/brand/mark.svg','public/brand/mark.svg','image/svg+xml'],
  ['/assets/brand/logo-light.svg','public/brand/logo-light.svg','image/svg+xml'],
  ['/assets/brand/logo-dark.svg','public/brand/logo-dark.svg','image/svg+xml'],
  ['/assets/brand/social-card.svg','public/brand/social-card.svg','image/svg+xml'],
]){
  let body=await fs.readFile(file,'utf8');if(file.endsWith('.ts'))body=compile(body);
  assets[path]={body,type,etag:'"'+createHash('sha256').update(body).digest('hex').slice(0,20)+'"'};
  if(path.startsWith('/assets/')&&file.endsWith('.ts'))await fs.writeFile(`dist/client/${path.split('/').at(-1)}`,body);
}
const social=await fs.readFile('public/brand/social-card.png');
assets['/assets/brand/social-card.png']={body:social.toString('base64'),binary:true,type:'image/png',etag:'"'+createHash('sha256').update(social).digest('hex').slice(0,20)+'"'};
const server=compile(await fs.readFile('src/server.ts','utf8'));
const wrapper=`
const ASSETS=${JSON.stringify(assets)};
const SECURITY={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; manifest-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'"
};
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response;
    try{
      if(url.pathname.startsWith('/api/'))response=await api(request,env,ctx);
      else{
        const asset=ASSETS[url.pathname];
        const configuredOrigin=env.PUBLIC_SITE_URL;
        let origin=url.origin;
        if(configuredOrigin){try{const canonical=new URL(configuredOrigin);if(['https:','http:'].includes(canonical.protocol))origin=canonical.origin;}catch{}}
        const escapedOrigin=origin.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        const etag=asset&&url.pathname==='/'?asset.etag.slice(0,-1)+'-'+btoa(origin)+'"':asset?.etag;
        if(!asset)response=new Response('Nicht gefunden',{status:404});
        else if(!['GET','HEAD'].includes(request.method))response=new Response('Methode nicht erlaubt',{status:405});
        else if(request.headers.get('If-None-Match')===etag)response=new Response(null,{status:304,headers:{ETag:etag}});
        else response=new Response(request.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body.replaceAll('__PUBLIC_ORIGIN__',escapedOrigin),{headers:{'Content-Type':asset.type,ETag:etag,'Cache-Control':'public, max-age=0, must-revalidate'}});
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
