import test from'node:test';
import assert from'node:assert/strict';
import{postgres,parameterize}from'../scripts/postgres.mjs';
import{collect,dashboard,heartbeat,monitoring}from'../dist/server/index.js';
const enabled=process.env.TEST_POSTGRES==='true';
test('PostgreSQL migrations, concurrent collectors, atomic peaks, restarts and read-only Web', {skip:!enabled},async()=>{
 if(!process.env.POSTGRES_DB?.endsWith('_test'))throw new Error('A disposable database ending in _test is required.');
 const db=postgres();await db.migrate();await db.migrate();
 const env={DB:db,TWITCH_CLIENT_ID:'test',TWITCH_CLIENT_SECRET:'test'},original=globalThis.fetch;let viewers=321,calls=0;
 const row=()=>({id:'stream-id',user_id:'123',user_login:'sample',user_name:'Sample',viewer_count:viewers,language:'de',title:'Test',thumbnail_url:'',started_at:new Date().toISOString()});
 globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/token'))return Response.json({access_token:'test-token',expires_in:3600});if(u.pathname.endsWith('/games'))return Response.json({data:[{id:'gta6',name:'Grand Theft Auto VI'}]});if(u.pathname.endsWith('/users'))return Response.json({data:[]});calls++;return Response.json({data:[row()]});};
 try{
  await db.pool.query('TRUNCATE snapshots,country_mappings,collector_state,profiles,admin_attempts,viewer_peaks,recording_state,monitor_status RESTART IDENTITY CASCADE');
  await db.prepare("INSERT INTO country_mappings VALUES('123','DE','verified',?)").bind(Date.now()).run();
  await Promise.all([collect(env),collect(env),collect(env)]);assert.equal(calls,1);
  let d=await dashboard(env);assert.equal(d.snapshot.viewers,321);assert.equal(d.peaks.global.viewers,321);assert.equal(d.countries[0].peak.viewers,321);const at=d.peaks.global.viewersAt;
  await db.prepare('UPDATE collector_state SET next_attempt_at=0').run();viewers=90;await collect(env);d=await dashboard(env);assert.equal(d.peaks.global.viewers,321);assert.equal(d.peaks.global.viewersAt,at);
  await heartbeat(env,'integration-worker');const readOnly={DB:db,MONITOR_EXPECT_WORKER:'true'};d=await dashboard(readOnly);assert.equal(d.status,'live');assert.equal(d.monitoring.configured,true);assert.equal((await monitoring(readOnly)).healthy,true);
  await db.close();const reopened=postgres();try{const after=await dashboard({...readOnly,DB:reopened});assert.equal(after.peaks.global.viewers,321);assert.equal(after.peaks.global.viewersAt,at);assert.equal(after.snapshot.streams[0].peak.entityId,'123');}finally{await reopened.close();}
 }finally{globalThis.fetch=original;await db.close();}
});
test('PostgreSQL placeholders preserve quoted question marks',()=>{assert.equal(parameterize("SELECT '?' AS x, ? AS y, \"?\" AS z"),"SELECT '?' AS x, $1 AS y, \"?\" AS z");});

test('read-only SQLite import preserves old records and refuses a populated target',{skip:!enabled},async()=>{
 if(!process.env.POSTGRES_DB?.endsWith('_test'))throw new Error('Disposable _test database required');
 const{mkdtempSync,chmodSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const{spawn}=await import('node:child_process');
 const{database}=await import('../scripts/database.mjs');const{peakUpdates}=await import('../dist/server/index.js');
 const db=postgres();await db.migrate();await db.pool.query('TRUNCATE snapshots,country_mappings,collector_state,profiles,admin_attempts,viewer_peaks,recording_state,monitor_status RESTART IDENTITY CASCADE');
 const dir=mkdtempSync(join(tmpdir(),'leonida-import-test-')),path=join(dir,'source.sqlite');const source=database(path);
 const s={id:'old-stream',userId:'900',login:'oldname',name:'Old name',title:'GTA VI',viewers:123,language:'en',country:'DE',avatar:'',thumbnail:'',startedAt:'',delta:null};
 const at=1700000000123;
 await source.prepare("INSERT INTO snapshots(captured_at,started_at,game_id,viewers,channels,complete,payload) VALUES(?,?,'gta6',123,1,1,?)").bind(at,at,JSON.stringify([s])).run();
 await source.batch(peakUpdates({DB:source},[s],123,at));source.close();chmodSync(path,0o444);chmodSync(dir,0o555);
 async function run(){return await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/import-sqlite.mjs',path],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('exit',code=>resolve({code,output}));});}
 try{
  const first=await run();assert.equal(first.code,0,first.output);const d=await dashboard({DB:db,MONITOR_EXPECT_WORKER:'true'});assert.equal(d.peaks.global.viewers,123);assert.equal(d.peaks.global.viewersAt,at);assert.equal(d.peaks.startedAt,at);assert.equal(d.snapshot.streams[0].peak.entityId,'900');
  const second=await run();assert.equal(second.code,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM snapshots').first()).n,1);
 }finally{chmodSync(dir,0o755);rmSync(dir,{recursive:true,force:true});await db.close();}
});
