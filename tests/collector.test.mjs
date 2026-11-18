import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from '../scripts/database.mjs';
let serial=0;
const originalFetch=globalThis.fetch;
const stream=(id,user,viewers,language='en')=>({id,user_id:user,user_login:`channel${user}`,user_name:`Channel ${user}`,viewer_count:viewers,language,title:`Live ${id}`,thumbnail_url:'https://static-cdn.jtvnw.net/test-{width}x{height}.jpg',started_at:new Date().toISOString()});
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
async function context(options={}){
  const module=await import(`../dist/server/index.js?test=${serial++}`);
  const db=database();
  const env={DB:db,TWITCH_CLIENT_ID:'test-client',TWITCH_CLIENT_SECRET:'test-secret',ADMIN_TOKEN:'a'.repeat(40),CRON_TOKEN:'c'.repeat(40),...options};
  return{...module,db,env,worker:module.default};
}
function mock(handler){
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);calls.push({url:u,init});
    if(u.pathname==='/oauth2/token')return response({access_token:'app-token',expires_in:3600});
    if(u.pathname==='/helix/games')return response({data:[{id:'gta6',name:'Grand Theft Auto VI'}]});
    if(u.pathname==='/helix/users')return response({data:u.searchParams.getAll('id').map(id=>({id,profile_image_url:`https://static-cdn.jtvnw.net/${id}.png`}))});
    return handler(u,init,calls);
  };return calls;
}
async function due(c){await c.db.prepare('UPDATE collector_state SET next_attempt_at=0').run();}
async function request(c,path,method='GET',body,token){return c.worker.fetch(new Request(`https://tracker.example${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),c.env,{waitUntil(){}});}
test.afterEach(()=>{globalThis.fetch=originalFetch;});

test('full cursor pagination deduplicates stream IDs and sorts true measurements',async()=>{
  const c=await context();const calls=mock(u=>response(u.searchParams.has('after')?{data:[stream('b','2',120,'de'),stream('c','3',30)],pagination:{}}:{data:[stream('a','1',50),stream('b','2',100,'de')],pagination:{cursor:'page2'}}));
  await c.collect(c.env);const d=await c.dashboard(c.env);
  assert.equal(d.status,'live');assert.equal(d.snapshot.viewers,200);assert.equal(d.snapshot.channels,3);
  assert.deepEqual(d.snapshot.streams.map(s=>s.viewers),[120,50,30]);assert.equal(d.snapshot.complete,true);
  assert.equal(d.countries[0].code,'ZZ');assert.equal(d.countries[0].viewers,200);assert.equal(d.mappedViewers,0);
  assert.equal(d.languages.find(g=>g.code==='de').viewers,120);assert.equal(d.snapshot.streams[0].country,'ZZ');
  assert.equal(calls.filter(c=>c.url.pathname==='/helix/streams').length,2);
  assert.ok(calls.every(c=>c.url.hostname==='id.twitch.tv'||c.url.hostname==='api.twitch.tv'));
  assert.equal(d.snapshot.streams[0].thumbnail,'https://static-cdn.jtvnw.net/test-440x248.jpg');
  assert.equal(d.snapshot.streams[0].delta,null);
  const payload=JSON.stringify(d);assert.ok(!payload.includes('test-secret'));assert.ok(!payload.includes('app-token'));
  c.db.close();
});
test('shared persisted gate coalesces simultaneous collectors and browser requests',async()=>{
  const c=await context();const calls=mock(()=>response({data:[stream('a','1',10)]}));
  await Promise.all([c.collect(c.env),c.collect(c.env),c.collect(c.env)]);
  await c.collect(c.env);assert.equal(calls.filter(x=>x.url.pathname==='/helix/streams').length,1);
  assert.equal((await c.latest(c.env)).length,1);c.db.close();
});
test('second complete snapshot yields actual positive, negative, zero and new-stream deltas',async()=>{
  const c=await context();mock(()=>response({data:[stream('a','1',100),stream('b','2',80),stream('c','3',50)]}));await c.collect(c.env);await due(c);
  mock(()=>response({data:[stream('a','1',120),stream('b','2',70),stream('c','3',50),stream('d','4',10)]}));await c.collect(c.env);
  const d=await c.dashboard(c.env);assert.equal(d.snapshot.viewers-d.previous.viewers,20);
  assert.deepEqual(d.snapshot.streams.map(s=>s.delta),[20,-10,0,null]);assert.equal(d.history.length,1); // same genuine time bucket
  assert.equal((await c.latest(c.env)).length,2);c.db.close();
});
test('page cap marks a partial sum and suppresses noncomparable deltas',async()=>{
  const c=await context({MAX_STREAM_PAGES:'1'});mock(()=>response({data:[stream('a','1',17)],pagination:{cursor:'more'}}));await c.collect(c.env);
  const d=await c.dashboard(c.env);assert.equal(d.status,'partial');assert.equal(d.snapshot.complete,false);assert.equal(d.snapshot.viewers,17);assert.match(d.snapshot.reason,/limit/i);assert.equal(d.countries[0].delta,null);c.db.close();
});
test('a later-page failure retains the successfully measured partial data',async()=>{
  const c=await context();mock(u=>u.searchParams.has('after')?response({},403):response({data:[stream('a','1',91)],pagination:{cursor:'next'}}));await c.collect(c.env);
  const d=await c.dashboard(c.env);assert.equal(d.status,'partial');assert.equal(d.snapshot.viewers,91);assert.match(d.message,/403/);c.db.close();
});
test('first-page failure preserves the previous snapshot as stale',async()=>{
  const c=await context();mock(()=>response({data:[stream('a','1',88)]}));await c.collect(c.env);await due(c);
  mock(()=>response({},403));await c.collect(c.env);const d=await c.dashboard(c.env);
  assert.equal(d.status,'stale');assert.equal(d.snapshot.viewers,88);assert.equal((await c.latest(c.env)).length,1);assert.ok(d.lastAttemptAt>=d.snapshot.capturedAt);c.db.close();
});
test('429 backs off to Twitch reset without blocking or publishing a false zero',async()=>{
  const c=await context();const reset=Math.ceil(Date.now()/1000)+120;
  mock(()=>response({},429,{'Ratelimit-Reset':String(reset)}));await c.collect(c.env);const d=await c.dashboard(c.env);
  assert.equal(d.status,'error');assert.equal(d.snapshot,null);assert.ok(d.nextAttemptAt>=reset*1000);c.db.close();
});
test('an exhausted successful page is kept before the next page is rate limited',async()=>{
  const c=await context();mock(()=>response({data:[stream('a','1',222)],pagination:{cursor:'next'}},200,{'Ratelimit-Remaining':'0','Ratelimit-Reset':String(Math.ceil(Date.now()/1000)+120)}));
  await c.collect(c.env);const d=await c.dashboard(c.env);assert.equal(d.status,'partial');assert.equal(d.snapshot.viewers,222);assert.ok(d.nextAttemptAt>Date.now()+60000);c.db.close();
});
test('revoked access token is renewed automatically once after 401',async()=>{
  const c=await context();let count=0;const calls=mock(()=>++count===1?response({},401):response({data:[stream('a','1',42)]}));await c.collect(c.env);
  assert.equal((await c.dashboard(c.env)).status,'live');assert.equal(calls.filter(c=>c.url.pathname==='/oauth2/token').length,2);c.db.close();
});
test('missing category is explicit and validated configured ID is used as fallback',async()=>{
  const c=await context();globalThis.fetch=async(url)=>new URL(url).pathname==='/oauth2/token'?response({access_token:'token',expires_in:3600}):response({data:[]});await c.collect(c.env);
  assert.equal((await c.dashboard(c.env)).status,'no-category');assert.equal((await c.latest(c.env)).length,0);
  c.env.TWITCH_GAME_ID='123';await due(c);globalThis.fetch=async(url)=>{const u=new URL(url);if(u.pathname==='/helix/games')return response({data:u.searchParams.has('id')?[{id:'123',name:'Grand Theft Auto VI'}]:[]});return response({data:[]});};
  await c.collect(c.env);const d=await c.dashboard(c.env);assert.equal(d.snapshot.gameId,'123');assert.equal(d.snapshot.viewers,0);assert.equal(d.status,'live');c.db.close();
});
test('unconfigured server never fabricates measurements or invokes Twitch',async()=>{
  const c=await context({TWITCH_CLIENT_ID:'',TWITCH_CLIENT_SECRET:''});globalThis.fetch=()=>{throw new Error('Must not fetch');};await c.collect(c.env);
  const d=await c.dashboard(c.env);assert.equal(d.status,'unconfigured');assert.equal(d.snapshot,null);assert.deepEqual(d.history,[]);c.db.close();
});
test('mapping admin requires bearer auth, validates ISO codes, upserts and deletes',async()=>{
  const c=await context();assert.equal((await request(c,'/api/admin/mappings')).status,401);
  for(const mappings of [[{userId:'1',countryCode:'XX'}],[null],[{userId:'abc',countryCode:'DE'}]])assert.equal((await request(c,'/api/admin/mappings','PUT',{mappings},c.env.ADMIN_TOKEN)).status,400);
  assert.equal((await request(c,'/api/admin/mappings','PUT',null,c.env.ADMIN_TOKEN)).status,400);
  const put=await request(c,'/api/admin/mappings','PUT',{mappings:[{userId:'123',countryCode:'DE',note:'confirmed'}]},c.env.ADMIN_TOKEN);assert.equal(put.status,200);
  assert.equal((await(await request(c,'/api/admin/mappings','GET',undefined,c.env.ADMIN_TOKEN)).json()).mappings[0].country_code,'DE');
  await request(c,'/api/admin/mappings','PUT',{mappings:[{userId:'123',countryCode:'AT'}]},c.env.ADMIN_TOKEN);
  assert.equal((await c.db.prepare('SELECT COUNT(*) AS n FROM country_mappings').first()).n,1);
  await request(c,'/api/admin/mappings','DELETE',{userId:'123'},c.env.ADMIN_TOKEN);
  assert.equal((await c.db.prepare('SELECT COUNT(*) AS n FROM country_mappings').first()).n,0);c.db.close();
});
test('manual mapping uses user ID; unmapped viewers remain in global totals',async()=>{
  const c=await context();await request(c,'/api/admin/mappings','PUT',{mappings:[{userId:'1',countryCode:'DE'}]},c.env.ADMIN_TOKEN);
  mock(()=>response({data:[stream('a','1',70,'en'),stream('b','2',30,'de')]}));await c.collect(c.env);const d=await c.dashboard(c.env);
  assert.equal(d.mappedViewers,70);assert.equal(d.mappedChannels,1);assert.equal(d.snapshot.viewers,100);
  assert.equal(d.countries.find(g=>g.code==='ZZ').viewers,30);assert.equal(d.languages.find(g=>g.code==='de').viewers,30);assert.equal(d.snapshot.streams[0].country,'DE');c.db.close();
});
test('admin authentication attempts are bounded and cron requires its own token',async()=>{
  const c=await context({TWITCH_CLIENT_ID:''});for(let i=0;i<20;i++)assert.equal((await request(c,'/api/admin/mappings','GET',undefined,'wrong')).status,401);
  assert.equal((await request(c,'/api/admin/mappings')).status,429);
  assert.equal((await request(c,'/api/collect','POST',undefined,c.env.ADMIN_TOKEN)).status,401);
  assert.equal((await request(c,'/api/collect','POST',undefined,c.env.CRON_TOKEN)).status,200);c.db.close();
});
test('worker serves functional assets with security headers and conditional caching',async()=>{
  const c=await context();const page=await request(c,'/');assert.equal(page.status,200);assert.match(await page.text(),/Leonida Viewers/);
  assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);
  for(const path of ['/assets/client.js','/assets/style.css','/assets/demo.js','/favicon.svg'])assert.equal((await request(c,path)).status,200);
  const cached=await c.worker.fetch(new Request('https://tracker.example/',{headers:{'If-None-Match':page.headers.get('ETag')}}),c.env,{});assert.equal(cached.status,304);
  assert.equal((await request(c,'/.env')).status,404);assert.equal((await request(c,'/api/admin/unknown','GET',undefined,c.env.ADMIN_TOKEN)).status,404);c.db.close();
});
test('bulk stream chunks persist measurements beyond a single database-value limit',async()=>{
  const c=await context();const streams=Array.from({length:600},(_,i)=>stream(`id${i}`,String(i+1),i));let page=0;
  mock(()=>{page++;return response({data:streams.slice((page-1)*100,page*100),pagination:page<6?{cursor:`p${page+1}`}:{}});});await c.collect(c.env);
  const d=await c.dashboard(c.env);assert.equal(d.snapshot.channels,600);assert.equal(d.snapshot.streams.length,600);assert.equal(d.snapshot.viewers,179700);
  assert.equal((await c.db.prepare('SELECT COUNT(*) AS n FROM snapshot_chunks').first()).n,3);c.db.close();
});
