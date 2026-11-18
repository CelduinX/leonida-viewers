import {collect,heartbeat,interval} from '../dist/server/index.js';
import {log} from './runtime.mjs';
export function startMonitor(env){
  const workerId=crypto.randomUUID();let stopped=false,heartbeatPending=false,failures=0,wake;
  async function beat(){if(heartbeatPending||stopped)return;heartbeatPending=true;try{await heartbeat(env,workerId);}catch(e){log('heartbeat_error',{type:e.name,code:e.code||'database_error'});}finally{heartbeatPending=false;}}
  const beatTimer=setInterval(()=>void beat(),10000);
  const loop=(async()=>{
    await beat();log('monitor_started',{workerId,intervalSeconds:interval(env)/1000,configured:!!(env.TWITCH_CLIENT_ID&&env.TWITCH_CLIENT_SECRET)});
    while(!stopped){
      try{await collect(env);failures=0;}catch(e){failures++;log('monitor_iteration_error',{type:e.name,code:e.code||'database_error',consecutive:failures});}
      if(failures>=3){log('monitor_fatal');stopped=true;process.exitCode=1;break;}
      if(stopped)break;
      await new Promise(resolve=>{const timer=setTimeout(resolve,5000);wake=()=>{clearTimeout(timer);resolve();};});
    }
    clearInterval(beatTimer);
    if(process.exitCode===1)process.kill(process.pid,'SIGTERM');
  })();
  return{workerId,async stop(){stopped=true;clearInterval(beatTimer);wake?.();await loop;},done:loop};
}
