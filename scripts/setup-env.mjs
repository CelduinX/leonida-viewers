import{readFileSync,writeFileSync,existsSync,renameSync,chmodSync}from'node:fs';
import{randomBytes}from'node:crypto';
let current=existsSync('.env')?readFileSync('.env','utf8'):'';
const template=readFileSync('.env.example','utf8');
for(const line of template.split('\n')){
  const match=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(!match)continue;
  const [,key,fallback]=match;
  const regex=new RegExp(`^${key}=.*$`,'m');
  if(!regex.test(current))current+=(current.endsWith('\n')?'':'\n')+key+'='+fallback+'\n';
}
for(const key of ['POSTGRES_PASSWORD','ADMIN_TOKEN','CRON_TOKEN']){
  const regex=new RegExp(`^${key}=(.*)$`,'m'),match=current.match(regex);
  if(match&&(!match[1].trim()||['""',"''"].includes(match[1].trim())))current=current.replace(regex,key+'='+randomBytes(32).toString('hex'));
}
const tmp='.env.setup.tmp';writeFileSync(tmp,current,{mode:0o600});renameSync(tmp,'.env');chmodSync('.env',0o600);
console.log('.env eingerichtet. Vorhandene Twitch-Zugangsdaten bleiben unverändert; keine Secrets werden ausgegeben.');
