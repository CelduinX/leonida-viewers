import type { DashboardData, Stream, Group } from './types.ts';
// Explicit, static design fixtures. Never used by the API or collector.
export function demoData(): DashboardData {
  const rows: [string,string,string,number,number,string][] = [
    ['vicewave','US','en',184320,6240,'FIRST NIGHT IN VICE CITY 🌴 | GTA VI'],
    ['neonrider','DE','de',142850,3480,'Willkommen in Leonida! 🌴 GTA VI entdecken'],
    ['sunsetdistrict','FR','fr',119420,-1850,'On découvre Vice City ensemble | GTA VI'],
    ['afterhours','GB','en',98410,4250,'GTA VI • The city never sleeps'],
    ['playaleonida','ES','es',88760,2170,'¡Bienvenidos a Leonida! Primeras misiones'],
    ['coastlinegg','US','en',81240,1640,'Road trip across Leonida | GTA VI'],
    ['midnightbyte','DE','de',73690,-930,'GTA VI Story • Keine Spoiler im Chat'],
    ['oceandrive','BR','pt',69250,1870,'Explorando cada canto de Leonida'],
    ['pinkhorizon','US','en',65720,890,'GTA VI free roam • good vibes only'],
    ['citylightslive','FR','fr',58410,1120,'Les secrets de la ville | GTA VI FR'],
    ['lowriderclub','DE','de',52720,1360,'Wir bauen die schönste Garage in GTA VI'],
    ['theviceclub','GB','en',49310,-650,'GTA VI story continues | Day 02'],
    ['lunanights','ES','es',44830,980,'Historias de Leonida • GTA VI en español'],
    ['velvetpixel','CA','en',38940,740,'Taking the scenic route • GTA VI'],
    ['sundownarcade','US','en',33780,-220,'Late night in Vice City 🌙'],
    ['neonbloom','JP','ja',27560,430,'GTA VI 初めてのレオニダへ'],
    ['pixelpalm','ZZ','en',22480,0,'Just cruising around • GTA VI'],
    ['coast2coast','AU','en',17390,680,'GTA VI sunrise sessions'],
    ['radiorosa','BR','pt',12450,160,'GTA VI • Mais uma noite em Vice City'],
    ['vicesignal','ZZ','other',34463,-370,'Grand Theft Auto VI | Exploring Leonida'],
  ];
  const at = Date.now() - 12000;
  const streams: Stream[] = rows.map(([name,country,language,viewers,delta,title],i) => ({
    id: `sample-${i}`, userId: String(900000000 + i), login: name, name, country, language,
    viewers, delta, title, avatar: '', thumbnail: '', startedAt: new Date(at - 7200000).toISOString(),
  })).sort((a,b) => b.viewers-a.viewers);
  const previous = streams.map(s=>({...s,viewers:s.viewers-s.delta!}));
  function groups(key:'country'|'language'): Group[] {
    const map = new Map<string,Group>();
    for(const s of streams){const g=map.get(s[key])||{code:s[key],viewers:0,channels:0,delta:0};g.viewers+=s.viewers;g.channels++;g.delta!+=s.delta!;map.set(g.code,g);}
    return [...map.values()].sort((a,b)=>b.viewers-a.viewers);
  }
  const total = streams.reduce((a,s)=>a+s.viewers,0);
  const snapshot = {id:1,capturedAt:at,startedAt:at-1500,gameId:'design-preview',viewers:total,channels:streams.length,complete:true,reason:null,streams};
  const values = [765,782,776,804,817,810,829,812,795,816,837,845,831,853,868,859,882,890,881,903,924,915,936,921,944,957,948,963,978,966,987,1000];
  return {status:'live',message:null,intervalMs:60000,nextAttemptAt:at+60000,lastAttemptAt:at,snapshot,
    previous:{...snapshot,id:0,capturedAt:at-60000,viewers:previous.reduce((a,s)=>a+s.viewers,0),streams:previous},
    countries:groups('country'),languages:groups('language'),mappedViewers:streams.filter(s=>s.country!=='ZZ').reduce((a,s)=>a+s.viewers,0),mappedChannels:18,
    peaks:{startedAt:null,global:null,countries:[],channels:[]},monitoring:{healthy:false,live:false,configured:false,status:'demo',heartbeatAt:null,lastStartedAt:null,lastCompletedAt:null,lastSuccessAt:null,lastSnapshotAt:null,lastDurationMs:null,consecutiveFailures:0,successes:0,partials:0,failures:0,nextAttemptAt:0,error:null},
    history:values.map((v,i)=>({at:at-(values.length-1-i)*45*60000,viewers:Math.round(total*v/1000),channels:20,complete:true})),demo:true};
}
