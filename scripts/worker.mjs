import {openDatabase,log}from'./runtime.mjs';
import {startMonitor}from'./monitor.mjs';
try{
  const db=await openDatabase(process.env,{migrate:process.env.AUTO_MIGRATE!=='false'});
  const monitor=startMonitor({...process.env,DB:db});
  let closing=false;
  async function stop(){if(closing)return;closing=true;await monitor.stop();await db.close();log('monitor_stopped');}
  process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
}catch(e){log('worker_start_failed',{type:e.name,code:e.code||'startup_error'});process.exit(1);}
