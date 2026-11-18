import test from 'node:test';
import assert from 'node:assert/strict';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{database}from'../scripts/database.mjs';
let serial=0;const nativeFetch=globalThis.fetch,nativeNow=Date.now;
const row=(id,user,viewers,extra={})=>({id,user_id:user,user_login:'user'+user,user_name:'User '+user,viewer_count:viewers,language:'de',title:'GTA VI',thumbnail_url:'',started_at:new Date().toISOString(),...extra});
async function context(path){const m=await import(`../dist/server/index.js?records=${serial++}`);const db=database(path);return{...m,db,env:{DB:db,TWITCH_CLIENT_ID:'test',TWITCH_CLIENT_SECRET:'test',COLLECTION_BUDGET_SECONDS:'5'},worker:m.default};}
function fixture(streams,{cursor,status=200}={}){globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/token'))return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}));if(u.pathname.endsWith('/games'))return new Response(JSON.stringify({data:[{id:'gta6',name:'Grand Theft Auto VI'}]}));if(u.pathname.endsWith('/users'))return new Response(JSON.stringify({data:[]}));return new Response(JSON.stringify({data:streams,pagination:cursor?{cursor}:{}}),{status});};}
async function measure(c,rows,at=Date.now(),options={}){Date.now=()=>at;await c.db.prepare('UPDATE collector_state SET next_attempt_at=0').run();fixture(rows,options);await c.collect(c.env);return c.dashboard(c.env);}
test.afterEach(()=>{globalThis.fetch=nativeFetch;Date.now=nativeNow;});
test('global viewers, channel maxima and recording start retain independent UTC timestamps',async()=>{
 const c=await context(),at=1700000000000;
 let d=await measure(c,[row('a','1',150),row('b','2',50)],at);
 assert.equal(d.peaks.startedAt,at);assert.equal(d.peaks.global.viewers,200);assert.equal(d.peaks.global.channels,2);
 d=await measure(c,[row('a','1',40),row('b','2',40),row('c','3',30)],at+60000);
 assert.equal(d.peaks.global.viewers,200);assert.equal(d.peaks.global.viewersAt,at);assert.equal(d.peaks.global.channels,3);assert.equal(d.peaks.global.channelsAt,at+60000);
 d=await measure(c,[row('a','1',250)],at+120000);
 assert.equal(d.peaks.global.viewers,250);assert.equal(d.peaks.global.viewersAt,at+120000);assert.equal(d.peaks.global.channelsAt,at+60000);assert.equal(d.peaks.startedAt,at);c.db.close();
});
test('equal viewer and channel peaks preserve the first occurrence',async()=>{
 const c=await context(),at=1700000000000;
 await measure(c,[row('a','1',100)],at);const d=await measure(c,[row('new-stream','1',100)],at+60000);
 assert.equal(d.peaks.global.viewersAt,at);assert.equal(d.peaks.global.channelsAt,at);assert.equal(d.snapshot.streams[0].peak.viewersAt,at);c.db.close();
});
test('country records use mapping at measurement time and do not rewrite past attribution',async()=>{
 const c=await context(),at=1700000000000;await c.db.prepare("INSERT INTO country_mappings VALUES('1','DE','confirmed',?)").bind(at).run();
 let d=await measure(c,[row('a','1',90),row('b','2',40)],at);
 assert.equal(d.countries.find(g=>g.code==='DE').peak.viewers,90);assert.equal(d.countries.find(g=>g.code==='ZZ').peak.viewers,40);
 await c.db.prepare("UPDATE country_mappings SET country_code='AT' WHERE user_id='1'").run();
 d=await measure(c,[row('a','1',70),row('b','2',20)],at+60000);
 assert.equal(d.countries.find(g=>g.code==='AT').peak.viewers,70);
 const old=await c.db.prepare("SELECT viewers,viewers_at FROM viewer_peaks WHERE scope='country' AND entity_id='DE'").first();assert.equal(old.viewers,90);assert.equal(old.viewers_at,at);c.db.close();
});
test('channel peaks survive stream-ID and display-name changes',async()=>{
 const c=await context(),at=1700000000000;await measure(c,[row('first','123',800)],at);
 const d=await measure(c,[row('second','123',100,{user_name:'Renamed',user_login:'renamed'})],at+60000);
 const p=d.snapshot.streams[0].peak;assert.equal(p.entityId,'123');assert.equal(p.viewers,800);assert.equal(p.name,'Renamed');assert.equal(p.login,'renamed');assert.equal(p.viewersAt,at);c.db.close();
});
test('partial, malformed, failed and unconfigured collections never start or raise records',async()=>{
 const c=await context(),at=1700000000000;c.env.MAX_STREAM_PAGES='1';let d=await measure(c,[row('a','1',99999)],at,{cursor:'more'});
 assert.equal(d.status,'partial');assert.deepEqual(d.peaks,{startedAt:null,global:null});
 d=await measure(c,[row('a','1',NaN)],at+60000);assert.equal(d.snapshot.complete,false);assert.equal(d.peaks.global,null);
 d=await measure(c,[],at+120000,{status:403});assert.equal(d.peaks.global,null);
 c.env.TWITCH_CLIENT_ID='';await c.collect(c.env);assert.equal((await c.dashboard(c.env)).peaks.startedAt,null);c.db.close();
});
test('partial high counts after a complete measurement preserve every previous record',async()=>{
 const c=await context(),at=1700000000000;await measure(c,[row('a','1',100)],at);c.env.MAX_STREAM_PAGES='1';
 const d=await measure(c,[row('a','1',99999)],at+60000,{cursor:'more'});
 assert.equal(d.peaks.global.viewers,100);assert.equal(d.snapshot.streams[0].peak.viewers,100);assert.equal(d.countries[0].peak.viewers,100);c.db.close();
});
test('records persist after connection restart and history retention removes original snapshots',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'leonida-records-'));const path=join(dir,'db.sqlite');let c=await context(path);const at=1700000000000;
 await measure(c,[row('a','1',500)],at);c.db.close();c=await context(path);c.env.HISTORY_RETENTION_DAYS='1';
 const d=await measure(c,[row('b','1',100)],at+3*86400000);
 assert.equal(d.peaks.global.viewers,500);assert.equal(d.peaks.global.viewersAt,at);assert.equal(d.peaks.startedAt,at);
 assert.equal((await c.db.prepare('SELECT COUNT(*) AS n FROM snapshots').first()).n,1);assert.equal(d.snapshot.streams[0].peak.viewers,500);c.db.close();rmSync(dir,{recursive:true});
});
test('transaction rollback cannot publish a snapshot without its records',async()=>{
 const c=await context(),at=1700000000000;await measure(c,[row('a','1',100)],at);
 const original=c.db.batch.bind(c.db);c.db.batch=async statements=>{
   if(statements.some(s=>s.sql.startsWith('INSERT INTO snapshots')))return original([...statements,c.db.prepare("INSERT INTO recording_state(id,started_at) VALUES(1,0)")]);
   return original(statements);
 };
 const d=await measure(c,[row('a','1',1000)],at+60000);assert.equal(d.snapshot.viewers,100);assert.equal(d.peaks.global.viewers,100);assert.equal((await c.latest(c.env)).length,1);c.db.close();
});
test('a stolen lease rejects the entire snapshot-and-record transaction',async()=>{
 const c=await context(),at=1700000000000;await measure(c,[row('a','1',100)],at);const original=c.db.batch.bind(c.db);
 c.db.batch=async statements=>{if(statements.some(s=>s.sql.startsWith('INSERT INTO snapshots')))await c.db.prepare("UPDATE collector_state SET lease_owner='another-worker'").run();return original(statements);};
 const d=await measure(c,[row('a','1',9999)],at+60000);assert.equal(d.peaks.global.viewers,100);assert.equal(d.snapshot.viewers,100);c.db.close();
});
test('browser reads do not invoke collection and report worker heartbeat/data freshness separately',async()=>{
 const c=await context();let work=0;const r=await c.worker.fetch(new Request('https://example.org/api/dashboard'),c.env,{waitUntil(){work++;}});
 assert.equal(r.status,200);assert.equal(work,0);assert.equal((await c.latest(c.env)).length,0);
 await c.heartbeat(c.env,'worker-test');let h=await c.monitoring(c.env);assert.equal(h.healthy,true);assert.equal(h.live,false);
 await c.db.prepare('UPDATE monitor_status SET heartbeat_at=?').bind(Date.now()-100000).run();h=await c.monitoring(c.env);assert.equal(h.healthy,false);assert.equal(h.status,'offline');c.db.close();
});
test('legacy SQLite database upgrades in place without losing existing snapshots',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'leonida-migration-')),path=join(dir,'old.sqlite');
 const{DatabaseSync}=await import('node:sqlite');const{readFileSync}=await import('node:fs');let db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 db.prepare("INSERT INTO snapshots(captured_at,started_at,game_id,viewers,channels,complete,payload) VALUES(1,1,'gta6',123,1,1,'[]')").run();db.close();
 const migrated=database(path);assert.equal((await migrated.prepare('SELECT viewers FROM snapshots').first()).viewers,123);assert.equal((await migrated.prepare('SELECT COUNT(*) AS n FROM viewer_peaks').first()).n,0);migrated.close();rmSync(dir,{recursive:true});
});
