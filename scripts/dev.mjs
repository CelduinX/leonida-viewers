import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { loadEnvFile } from 'node:process';
try{loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
let child,rebuilding=false,pending=false;
async function build(){
  if(rebuilding){pending=true;return;}rebuilding=true;
  const p=spawn(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
  const code=await new Promise(r=>p.on('exit',r));
  if(code===0){if(child){child.kill('SIGTERM');await new Promise(r=>child.on('exit',r));}child=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});}
  rebuilding=false;if(pending){pending=false;void build();}
}
await build();let debounce;
for(const dir of ['src','public','migrations'])watch(dir,{recursive:true},()=>{clearTimeout(debounce);debounce=setTimeout(build,200);});
process.on('SIGINT',()=>{child?.kill('SIGTERM');process.exit(0);});
