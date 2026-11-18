import type { DashboardData, Group, Stream, Point, Peak } from './types.ts';

const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!;
const all = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];
const fmt = new Intl.NumberFormat('de-DE');
const percent = new Intl.NumberFormat('de-DE', {maximumFractionDigits:1});
const countryNames = new Intl.DisplayNames(['de'],{type:'region'});
const languageNames = new Intl.DisplayNames(['de'],{type:'language'});
const countryName = (code:string) => code==='ZZ'?'Unbekannt':countryNames.of(code)||code;
const languageName = (code:string) => {try{return code==='other'?'Andere / unbekannt':`${languageNames.of(code)||code} · ${code.toUpperCase()}`;}catch{return code;}};
const flag = (code:string) => code==='ZZ'?'◌':code.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0)));
const escape = (value:unknown) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const time = (value:number,full=false) => new Date(value).toLocaleString('de-DE',full?{dateStyle:'short',timeStyle:'medium'}:{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const paths:Record<string,string>={
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  language:'<path d="m5 8 6 7m-7 0 6-7 2-5M2 5h12M7 2v3m8 16 4-10 4 10m-6.5-3h5"/>',
  pulse:'<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/>',
  twitch:'<path d="M4 3h17v12l-5 5h-5l-4 3v-3H3V7Zm3 0v13h5v3l3-3h4V3M11 6v5m5-5v5"/>',
  video:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  crown:'<path d="m2 5 5 4 5-6 5 6 5-4-3 14H5Zm4 17h12"/>',
  flame:'<path d="M12 3c1 5 5 6 5 10 2-1 2-3 2-3 4 8-1 12-7 12-7 0-10-6-7-11 0 3 2 4 3 3-2-5 2-6 4-11Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
  settings:'<path d="m9 3-.6 2.4-2 .9L4 5.6 2 9l1.8 1.7v2.6L2 15l2 3.4 2.4-.7 2 .9L9 21h4l.6-2.4 2-.9 2.4.7 2-3.4-1.8-1.7v-2.6L20 9l-2-3.4-2.4.7-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  shield:'<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z"/><path d="m8 12 3 3 5-6"/>',
};
const icon = (name:string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.pulse}</svg>`;
all('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon!));
$('#year').textContent=String(new Date().getFullYear());

// One shared requestAnimationFrame scheduler. DOM updates capped at 30fps; hidden rows pause.
type Animation = {current:number;from:number;target:number;start:number;duration:number};
const animations = new Map<HTMLElement,Animation>();
const visible = new WeakSet<Element>();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const observer = new IntersectionObserver(entries=>entries.forEach(e=>e.isIntersecting?visible.add(e.target):visible.delete(e.target)));
let frame=0,lastFrame=0;
function tick(now:number){
  frame=0;
  if(document.hidden)return;
  let pending=false;
  for(const [el,a] of animations){
    if(!el.isConnected){animations.delete(el);observer.unobserve(el);continue;}
    const t=Math.min(1,Math.max(0,(now-a.start)/a.duration));
    a.current=a.from+(a.target-a.from)*t;
    if(t<1)pending=true;
    if(t===1||(visible.has(el)&&now-lastFrame>=32)){const next=fmt.format(Math.round(a.current));if(el.textContent!==next)el.textContent=next;}
  }
  if(now-lastFrame>=32)lastFrame=now;
  if(pending)frame=requestAnimationFrame(tick);
}
function num(el:HTMLElement,value:number,duration=60000,initial?:number){
  const existing=animations.get(el);
  if(existing?.target===value)return;
  const startValue=existing?.current??initial??value;
  const a={current:startValue,from:startValue,target:value,start:performance.now(),duration:reduced.matches?1:Math.max(1,duration)};
  animations.set(el,a);observer.observe(el);el.textContent=fmt.format(Math.round(startValue));
  if(reduced.matches){a.current=value;el.textContent=fmt.format(value);return;}
  if(!frame)frame=requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!frame)frame=requestAnimationFrame(tick);void refresh();}});
reduced.addEventListener('change',()=>{if(reduced.matches)for(const [el,a]of animations){a.current=a.target;a.from=a.target;el.textContent=fmt.format(a.target);}});
function delta(el:HTMLElement,value:number|null){
  el.className=`delta${value===null||value===0?'':value>0?' up':' down'}`;
  el.textContent=value===null?'—':value===0?'± 0':`${value>0?'↗ +':'↘ −'}${fmt.format(Math.abs(value))}`;
}
function reorder(container:HTMLElement,nodes:HTMLElement[]){
  const before=new Map([...container.children].map(el=>[el,el.getBoundingClientRect().top]));
  const keep=new Set(nodes);for(const el of [...container.children])if(!keep.has(el as HTMLElement))el.remove();
  for(const node of nodes)container.append(node);
  if(!reduced.matches)for(const node of nodes){const top=before.get(node);if(top!==undefined){const dy=top-node.getBoundingClientRect().top;if(Math.abs(dy)>1)node.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:600,easing:'cubic-bezier(.2,.8,.2,1)'});}}
}
let data:DashboardData|null=null;
let preview=new URLSearchParams(location.search).get('preview')==='1';
let range='24h',groupMode:'country'|'language'='country',view='overview',filter='all',languageFilter:string|null=null,query='';
let visibleStreams=5,showAllCountries=false,refreshing=false,lastSnapshot:number|null=null;
let adminToken='',mappings:{user_id:string;country_code:string;note:string;updated_at:number}[]=[];
let toastTimeout:ReturnType<typeof setTimeout>;
function toast(message:string){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,4500);}
function modal(id:string){const dialog=$<HTMLDialogElement>(id);all<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());dialog.showModal();}
all<HTMLDialogElement>('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();const m=e as MouseEvent;if(m.clientX<r.left||m.clientX>r.right||m.clientY<r.top||m.clientY>r.bottom)d.close();}});});
$('#admin-dialog').addEventListener('close',()=>lockAdmin());
function empty(container:HTMLElement,title:string,description:string,action?:string){container.classList.remove('skeleton-list');container.innerHTML=`<div class="empty-state">${icon('pulse')}<strong>${escape(title)}</strong><p>${escape(description)}</p>${action?`<button class="text-button" data-action="${action}">${action==='setup'?'Twitch verbinden':'Filter zurücksetzen'} ↗</button>`:''}</div>`;}
function render(){
  if(!data)return;
  const d=data,s=d.snapshot,p=d.previous;
  const duration=d.demo?2600:Math.max(1000,d.intervalMs-1000);
  const newSnapshot=s?.id!==lastSnapshot;
  $('#preview-banner').hidden=!preview;$('#preview-button').hidden=preview;
  $('#history-title').parentElement!.querySelector('p')!.textContent=preview?'Feste Beispielpunkte für die Designvorschau.':'Jeder Punkt eine gespeicherte Messung.';
  const conn=$('.status-pill');conn.classList.toggle('connected',!preview&&d.status==='live');conn.classList.toggle('preview',preview);
  $('#connection-label').textContent=preview?'Designvorschau':({live:'Daten aktuell',partial:'Teilerfassung',stale:'Daten veraltet',unconfigured:'Nicht verbunden','no-category':'Kategorie ausstehend',error:'Verbindungsfehler',pending:'Warte auf Messung'}[d.status]);
  $('#hero-live').innerHTML=`<i></i> ${preview?'BEISPIELDATEN':d.status==='live'?'TWITCH LIVE':d.status==='partial'?'TEILERFASSUNG':d.status==='stale'?'LETZTER STAND':'TWITCH TRACKER'}`;
  $('#hero-live i').style.animationPlayState=!preview&&d.status==='live'?'running':'paused';
  $('#stream-live-label').textContent=preview?'BEISPIEL':'STREAMS';
  const note=$('#notice');
  if(!preview&&d.status!=='live'){
    note.hidden=false;note.classList.toggle('warning',['partial','stale','error'].includes(d.status));
    const message=d.message||'Die erste Messung wird vorbereitet. Die Ansicht aktualisiert sich automatisch.';
    note.innerHTML=`<span>${escape(message)}${d.status==='stale'&&s?` Letzte Messung: ${escape(time(s.capturedAt,true))}.`:''}</span>${d.status==='unconfigured'?'<button data-action="setup">Verbindung einrichten ↗</button>':''}`;
  }else note.hidden=true;
  if(s){
    num($('#total'),s.viewers,duration,newSnapshot?p?.viewers:undefined);
    num($('#channels'),s.channels,duration,newSnapshot?p?.channels:undefined);
    const comparable=p?.complete&&s.complete&&s.gameId===p.gameId;
    delta($('#total-delta'),comparable?s.viewers-p.viewers:null);
    $('#total').setAttribute('aria-label',`${fmt.format(s.viewers)} Zuschauer laut letzter Messung${s.complete?'':'; Teilerfassung'}`);
    $('#total').title=`Letzter Messwert: ${fmt.format(s.viewers)} · ${time(s.capturedAt,true)}. Die sichtbare Zahl kann animiert sein.`;
    $('#total-caption').textContent=s.complete?'Zuschauer gleichzeitig weltweit':'Erfasste Zuschauer · globale Teilsumme';
    $('#last-measured').textContent=preview?'Feste Designvorschau · keine Messung':`Letzte Messung ${time(s.capturedAt)} Uhr`;
    $('#last-measured').title=`${time(s.capturedAt,true)} · Abrufdauer ${((s.capturedAt-s.startedAt)/1000).toFixed(1)} s`;
    num($('#country-count'),d.countries.filter(g=>g.code!=='ZZ').length,1200);
    $('#channels-note').textContent=preview?'Feste Beispielkanäle':s.complete?'Live auf Twitch':'Erfasste Kanäle';
    const coverage=s.viewers?d.mappedViewers/s.viewers*100:0;
    $('#coverage-note').textContent=`${percent.format(coverage)} % der Zuschauer zugeordnet`;
    $('#coverage-percent').textContent=`${percent.format(coverage)} %`;
    $('#coverage-bar').style.width=`${coverage}%`;
    $('#coverage-description').textContent=`${fmt.format(d.mappedChannels)} von ${fmt.format(s.channels)} Kanälen zugeordnet. Unbekannte bleiben enthalten.`;
    const top=s.streams[0];$('#top-name').textContent=top?.name||'—';
    const topCount=$('#top-count');
    if(top){if(!$('.top-number',topCount))topCount.innerHTML='<span class="top-number"></span> Zuschauer';num($('.top-number',topCount),top.viewers,duration,top.delta===null?undefined:top.viewers-top.delta);}else topCount.textContent='Keine aktiven Kanäle';
  }else{
    for(const id of ['total','channels','country-count','top-name']){$('#'+id).textContent='—';animations.delete($('#'+id));}
  }
  const select=$<HTMLSelectElement>('#country-filter'),selected=filter;
  select.innerHTML='<option value="all">Weltweit</option>'+d.countries.map(g=>`<option value="${escape(g.code)}">${escape(flag(g.code)+' '+countryName(g.code))}</option>`).join('');
  if(!d.countries.some(g=>g.code===selected))filter='all';select.value=filter;
  renderRecords();renderGroups(duration);renderStreams(duration);renderChart();
  lastSnapshot=s?.id??null;
}
function isNewRecord(peak:Peak){return !preview&&!!data?.snapshot?.complete&&peak.viewersAt===data.snapshot.capturedAt;}
function renderEntityPeak(el:HTMLElement,peak:Peak|undefined,hide=false){
  el.hidden=hide;
  if(hide)return;
  if(!peak){el.textContent=preview?'Peak · keine echten Messungen':'Peak · noch keine vollständige Messung';el.removeAttribute('title');return;}
  const fresh=isNewRecord(peak);
  el.innerHTML=`<span class="entity-peak-value${fresh?' record-now':''}">${fresh?'◆ ':''}Peak ${fmt.format(peak.viewers)}</span><time datetime="${new Date(peak.viewersAt).toISOString()}">${escape(time(peak.viewersAt,true))}</time>`;
  el.title=`GTA-VI-Rekord seit Beginn der Aufzeichnung: ${fmt.format(peak.viewers)} Zuschauer am ${time(peak.viewersAt,true)} · erster erfasster Wert ${time(peak.firstMeasuredAt,true)}`;
}
function renderRecords(){
  if(!data)return;
  const peak=data.peaks?.global;
  $('#global-peak').textContent=peak?fmt.format(peak.viewers):'—';
  $('#global-peak-time').textContent=peak?`Rekord aufgestellt am ${time(peak.viewersAt,true)}`:preview?'Keine echten Rekorde in der Designvorschau.':'Wartet auf die erste vollständige Twitch-Messung.';
  $('#recording-start').textContent=data.peaks?.startedAt?time(data.peaks.startedAt,true):'Noch nicht gestartet';
  $('#peak-channels').textContent=peak?`${fmt.format(peak.channels)} aktive Streams im Maximum`:'— aktive Streams im Maximum';
  $('#peak-channels-time').textContent=peak?time(peak.channelsAt,true):'';
  $('#peak-timezone').textContent=`Lokale Zeitzone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  $('#peak-new').hidden=!peak||!isNewRecord(peak);
  if(peak&&isNewRecord(peak))$('#peak-new').textContent=peak.viewersAt===peak.firstMeasuredAt?'ERSTE MESSUNG':'NEUER REKORD';
  const m=data.monitoring,badge=$('#monitor-badge');
  if(!m){badge.textContent='Kein Status';return;}
  const labels:Record<string,string>={live:'Aktiv',collecting:'Abfrage läuft',partial:'Teilerfassung',error:'API-Fehler','no-category':'Kategorie ausstehend',pending:'Wartet',unconfigured:'Nicht eingerichtet',offline:'Worker offline',stuck:'Worker blockiert'};
  badge.textContent=preview?'Designvorschau':labels[m.status]||m.status;
  badge.className=`monitor-badge${!preview&&m.healthy&&m.live?' good':!preview&&(!m.healthy||m.status==='error')?' bad':' warning'}`;
  $('#monitor-success').textContent=m.lastSuccessAt?time(m.lastSuccessAt,true):'Noch keine vollständige Messung';
  $('#monitor-heartbeat').textContent=m.heartbeatAt?time(m.heartbeatAt,true):preview?'Kein Worker im Demo-Modus':'Kein Worker-Signal';
  $('#monitor-counts').textContent=preview?'—':`${fmt.format(m.successes)} / ${fmt.format(m.partials)} / ${fmt.format(m.failures)}`;
  $('#monitor-message').textContent=preview?'Beispieldaten werden nicht als historische Rekorde gespeichert.':m.error||(!m.configured?'Twitch-Zugangsdaten im Worker hinterlegen.':!m.healthy?'Monitoring-Prozess prüfen. Die letzten Messungen bleiben gespeichert.':m.live?`Zentraler Abruf alle ${data.intervalMs/1000} s · letzte Dauer ${m.lastDurationMs??0} ms`:'Worker erreichbar. Noch keine aktuelle vollständige Messung.');
}
function renderGroups(duration=60000){
  if(!data)return;
  const groups=groupMode==='country'?data.countries:data.languages;
  $('#group-title').textContent=groupMode==='country'?'Die Welt im Ranking':'Live in jeder Sprache';
  $('#group-subtitle').textContent=groupMode==='country'?'Zuschauer nach zugeordnetem Streamer-Land':'Twitch-Sprachcodes · unabhängig vom Herkunftsland';
  $('#group-count').textContent=`${groupMode==='country'?groups.filter(g=>g.code!=='ZZ').length:groups.length} ${groupMode==='country'?'Länder':'Sprachen'}`;
  $('#group-column').textContent=groupMode==='country'?'LAND':'SPRACHE';
  all('[data-group]').forEach(el=>{const active=el.dataset.group===groupMode;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
  $('.coverage').hidden=groupMode==='language';
  const container=$('#country-list');container.classList.remove('skeleton-list');
  if(!groups.length){empty(container,data.snapshot?'Noch keine Live-Kanäle':'Die Welt wartet auf den ersten Stream.',data.snapshot?'Zur letzten Messung war kein GTA-VI-Kanal live.':'Sobald Twitch verbunden ist, erscheinen hier Länder und ihre Live-Zahlen.',data.status==='unconfigured'?'setup':undefined);return;}
  const oldNodes=new Map(all<HTMLElement>('.country-row',container).map(el=>[el.dataset.key,el]));
  const list=showAllCountries?groups:groups.slice(0,5);
  const nodes=list.map((g,i)=>{
    const key=`${groupMode}-${g.code}`;let row=oldNodes.get(key);
    if(!row){row=document.createElement('button');row.className='country-row';row.dataset.key=key;row.innerHTML='<span class="country-rank"></span><span class="flag"></span><span class="country-info"><span class="country-name"></span><span class="country-channels"></span><span class="country-peak"></span></span><span class="country-values"><span class="country-value"></span><span class="country-bar"><i></i></span></span>';}
    row.dataset.groupCode=g.code;row.setAttribute('aria-label',`${groupMode==='country'?countryName(g.code):languageName(g.code)}, ${fmt.format(g.viewers)} Zuschauer, ${g.channels} Kanäle anzeigen`);
    row.classList.toggle('selected',groupMode==='country'?filter===g.code:languageFilter===g.code);
    $('.country-rank',row).textContent=String(i+1).padStart(2,'0');$('.flag',row).textContent=groupMode==='country'?flag(g.code):g.code.toUpperCase();
    if(groupMode==='language')$('.flag',row).style.cssText='font-size:11px;color:#b299cc;font-weight:600';else $('.flag',row).style.cssText='';
    $('.country-name',row).textContent=groupMode==='country'?countryName(g.code):languageName(g.code);
    $('.country-channels',row).textContent=`${fmt.format(g.channels)} ${g.channels===1?'Kanal':'Kanäle'}`;
    renderEntityPeak($('.country-peak',row),groupMode==='country'?g.peak:undefined,groupMode==='language');
    const initial=g.delta===null?undefined:g.viewers-g.delta;
    num($('.country-value',row),g.viewers,duration,initial);
    $('.country-value',row).title=`Messwert ${fmt.format(g.viewers)} · Änderung ${g.delta===null?'unbekannt':fmt.format(g.delta)}`;
    $('.country-bar i',row).style.width=`${groups[0]?.viewers?g.viewers/groups[0].viewers*100:0}%`;
    return row;
  });
  reorder(container,nodes);
  const link=$('[data-action="all-countries"]');link.innerHTML=`${showAllCountries?'Weniger anzeigen':`Alle ${groupMode==='country'?'Länder':'Sprachen'} ansehen`} <span>↗</span>`;
}
function renderStreams(duration=60000){
  if(!data)return;
  const container=$('#stream-list');container.classList.remove('skeleton-list');
  const streams=data.snapshot?.streams||[];
  const matching=streams.filter(s=>(filter==='all'||s.country===filter)&&(!languageFilter||s.language===languageFilter)&&(!query||`${s.name} ${s.login} ${s.title}`.toLocaleLowerCase('de').includes(query)));
  const selectedCountry=filter==='all'?'weltweit':countryName(filter);
  $('#stream-title').textContent=filter==='all'&&!languageFilter?'Live im Rampenlicht':languageFilter?`Streams · ${languageName(languageFilter)}`:`Live in ${selectedCountry}`;
  $('#stream-subtitle').textContent=filter==='all'?'Die meistgesehenen GTA-VI-Streams weltweit':`Alle erfassten GTA-VI-Streams · ${selectedCountry}`;
  const more=$('#more-streams');more.hidden=matching.length<=visibleStreams;
  more.innerHTML=`${visibleStreams===5?'Alle Streamer':'Weitere 50 laden'} <span>↗</span>`;
  $('#stream-result').textContent=matching.length?`${fmt.format(Math.min(visibleStreams,matching.length))} von ${fmt.format(matching.length)} Kanälen · letzte Messung`:'Sortiert nach letzter Messung';
  if(!matching.length){empty(container,streams.length?'Keine passenden Streams.':data.snapshot?'Gerade ist es ruhig in Leonida.':'Die Bühne ist bereit.',streams.length?'Versuche einen anderen Namen oder setze die Filter zurück.':data.snapshot?'Zum letzten Messzeitpunkt war kein Kanal in dieser Kategorie live.':'Hier erscheinen die aktiven GTA-VI-Kanäle nach der ersten Twitch-Messung.',streams.length?'reset':data.status==='unconfigured'?'setup':undefined);return;}
  const oldNodes=new Map(all<HTMLElement>('.stream-row',container).map(el=>[el.dataset.key,el]));
  const globalRank=new Map(streams.map((s,i)=>[s.id,i+1]));
  const nodes=matching.slice(0,visibleStreams).map((s,i)=>{
    let row=oldNodes.get(s.id);
    if(!row){row=document.createElement('div');row.className='stream-row';row.dataset.key=s.id;
      row.innerHTML='<span class="stream-rank"></span><div class="stream-account"><span class="avatar"></span><div class="stream-meta"><a class="stream-name" target="_blank" rel="noopener noreferrer"></a><div class="stream-stream-title"></div><div class="stream-peak"></div></div></div><div class="stream-numbers"><span class="stream-number"></span><span class="delta"></span></div><a class="stream-external" target="_blank" rel="noopener noreferrer">↗</a>';
    }
    const rank=$('.stream-rank',row);rank.textContent=String(i+1).padStart(2,'0');rank.classList.toggle('top-rank',i===0);rank.title=`Globaler Rang ${globalRank.get(s.id)}`;
    const avatar=$('.avatar',row);
    if(avatar.dataset.url!==s.avatar||!avatar.hasChildNodes()){
      avatar.dataset.url=s.avatar;avatar.textContent=s.name.slice(0,2).toUpperCase();
      const hue=[...s.name].reduce((a,c)=>a+c.charCodeAt(0),0)%360;avatar.style.background=`linear-gradient(135deg,hsl(${hue} 25% 40%),hsl(${hue} 20% 16%))`;
      if(s.avatar&&/^https:\/\//.test(s.avatar)){const img=document.createElement('img');img.src=s.avatar;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove());avatar.append(img);}
    }
    const name=$<HTMLAnchorElement>('.stream-name',row);name.innerHTML=`${escape(s.name)} <span class="flag" title="${escape(countryName(s.country))}">${flag(s.country)}</span>`;
    const link=`https://www.twitch.tv/${encodeURIComponent(s.login)}`;
    const external=$<HTMLAnchorElement>('.stream-external',row);
    if(preview){name.removeAttribute('href');external.removeAttribute('href');external.setAttribute('aria-label','Fiktiver Kanal in der Designvorschau');}else{name.href=link;external.href=link;external.setAttribute('aria-label',`${s.name} auf Twitch öffnen`);}
    $('.stream-stream-title',row).textContent=s.title;$('.stream-stream-title',row).title=s.title;
    renderEntityPeak($('.stream-peak',row),s.peak);
    $('.stream-meta',row).title=`Twitch-User-ID: ${s.userId}`;
    num($('.stream-number',row),s.viewers,duration,s.delta===null?undefined:s.viewers-s.delta);
    $('.stream-number',row).title=`Letzter Messwert: ${fmt.format(s.viewers)} Zuschauer`;
    delta($('.delta',row),s.delta);
    return row;
  });reorder(container,nodes);
}
let chartPoints:Point[]=[];
function renderChart(){
  if(!data)return;
  const container=$('#chart');
  const now=data.demo?data.snapshot!.capturedAt:Date.now();
  const windowMs=(range==='1h'?1:range==='7d'?168:24)*3600000;
  const points=data.history.filter(p=>p.at>=now-windowMs);chartPoints=points;
  if(points.length<2){container.innerHTML=`<div class="chart-empty">${icon('pulse')}<strong>${points.length?'Der erste Messpunkt ist gespeichert.':'Der nächste große Moment beginnt hier.'}</strong><p>${points.length?'Mit der nächsten Messung beginnt der Verlauf.':'Der Verlauf erscheint nach den ersten Twitch-Messungen.'}</p></div>`;$('#chart-peak').textContent=points.length?`${fmt.format(points[0].viewers)} Zuschauer`:'Keine Messungen';return;}
  const width=1000,height=174,left=48,right=10,top=12,bottom=25;
  const min=Math.min(...points.map(p=>p.viewers)),max=Math.max(...points.map(p=>p.viewers));
  const pad=Math.max((max-min)*.22,max*.025,1);const low=Math.max(0,min-pad),high=max+pad;
  const first=points[0].at,last=points.at(-1)!.at;
  const x=(at:number)=>left+(at-first)/Math.max(1,last-first)*(width-left-right);
  const y=(v:number)=>top+(1-(v-low)/(high-low))*(height-top-bottom);
  const path=points.map((p,i)=>`${i?'L':'M'}${x(p.at).toFixed(2)},${y(p.viewers).toFixed(2)}`).join(' ');
  const short=(n:number)=>n>=1e6?`${percent.format(n/1e6)} Mio.`:n>=1000?`${Math.round(n/1000)} Tsd.`:fmt.format(Math.round(n));
  let grid='';for(let i=0;i<4;i++){const v=low+(high-low)*i/3;grid+=`<line class="grid-line" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="0" y="${y(v)+3}">${short(v)}</text>`;}
  let labels='';for(let i=0;i<6;i++){const at=first+(last-first)*i/5;labels+=`<text class="axis-label" x="${x(at)}" y="${height-3}" text-anchor="${i===0?'start':i===5?'end':'middle'}">${new Date(at).toLocaleString('de-DE',range==='7d'?{day:'2-digit',month:'2-digit',hour:'2-digit'}:{hour:'2-digit',minute:'2-digit'})}</text>`;}
  container.innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Verlauf aus ${points.length} ${preview?'Beispielpunkten':'gespeicherten Messungen'}, von ${fmt.format(points[0].viewers)} bis ${fmt.format(points.at(-1)!.viewers)} Zuschauern"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b58bf4" stop-opacity=".2"/><stop offset="1" stop-color="#b58bf4" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${path} L${x(last)},${height-bottom} L${left},${height-bottom} Z" fill="url(#chart-fill)"/><path d="${path}" stroke="#b493eb" stroke-width="2" fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${x(last)}" cy="${y(points.at(-1)!.viewers)}" r="3.5" fill="#d0b7f8"/>${points.filter(p=>!p.complete).map(p=>`<circle cx="${x(p.at)}" cy="${y(p.viewers)}" r="3" fill="#dfb074"/>`).join('')}${labels}</svg><div class="chart-tooltip" hidden></div>`;
  $('#history-note').textContent=preview?'Feste Beispielwerte · keine Messungen':`${points.length} Messungen${points.some(p=>!p.complete)?' · orange Punkte: Teilerfassung':''}`;
  $('#chart-peak').textContent=`Peak im Zeitraum: ${fmt.format(max)}`;
}
$('#chart').addEventListener('pointermove',e=>{
  const tip=$('.chart-tooltip',$('#chart'));if(!tip||chartPoints.length<2)return;
  const r=$('#chart').getBoundingClientRect(),t=Math.max(0,Math.min(1,((e.clientX-r.left)/r.width-.048)/.942));
  const at=chartPoints[0].at+(chartPoints.at(-1)!.at-chartPoints[0].at)*t;
  const p=chartPoints.reduce((a,b)=>Math.abs(a.at-at)<Math.abs(b.at-at)?a:b);
  tip.innerHTML=`${fmt.format(p.viewers)} Zuschauer<span>${escape(time(p.at,true))}${p.complete?'':' · Teilerfassung'}${preview?' · Beispiel':''}</span>`;
  tip.hidden=false;tip.style.left=`${Math.max(0,Math.min(r.width-190,e.clientX-r.left+12))}px`;
});
$('#chart').addEventListener('pointerleave',()=>{const tip=$('.chart-tooltip',$('#chart'));if(tip)tip.hidden=true;});
async function refresh(manual=false){
  if(refreshing||preview)return;
  refreshing=true;$('#refresh').classList.add('loading');$<HTMLButtonElement>('#refresh').disabled=true;
  try{
    const response=await fetch(`/api/dashboard?range=${range}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Server nicht erreichbar (HTTP ${response.status}).`);
    const next=await response.json() as DashboardData;if(preview)return;data=next;render();
    if(manual)toast('Gemeinsamen Datenstand geladen. Twitch-Abrufe folgen dem Serverintervall.');
  }catch(e){
    $('#notice').hidden=false;$('#notice').classList.add('warning');$('#notice').textContent='Verbindung unterbrochen. Letzte Daten bleiben sichtbar; erneuter Versuch folgt automatisch.';
    $('#connection-label').textContent='Verbindung unterbrochen';$('.status-pill').classList.remove('connected');
    if(!data){empty($('#country-list'),'Verbindung wird wiederhergestellt.','Die nächste Abfrage erfolgt automatisch.');empty($('#stream-list'),'Noch keine Daten erreichbar.','Bitte prüfe die Serververbindung.');}
    if(manual)toast(e instanceof Error?e.message:'Verbindungsfehler');
  }finally{refreshing=false;$('#refresh').classList.remove('loading');$<HTMLButtonElement>('#refresh').disabled=false;}
}
function setView(next:string){
  view=next;const titles:Record<string,string>={overview:'Übersicht',countries:'Länder-Ranking',streamers:'Live-Streamer',languages:'Streamsprachen'};
  $('#breadcrumb').textContent=titles[next]||titles.overview;
  all('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===next);if(el.dataset.view===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('main').classList.toggle('expanded',next!=='overview');$('main').classList.toggle('country-view',next==='countries'||next==='languages');$('main').classList.toggle('streamer-view',next==='streamers');
  $('#record-section').hidden=next!=='overview';$('#history-section').hidden=next!=='overview';$('.hero-grid').hidden=next!=='overview';$('.metrics-grid').hidden=next!=='overview';
  showAllCountries=next==='countries'||next==='languages';visibleStreams=next==='overview'?5:50;
  if(next==='languages')groupMode='language';if(next==='countries')groupMode='country';
  render();$('#sidebar').classList.remove('open');
}
async function enablePreview(){
  all<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());
  preview=true;const url=new URL(location.href);url.searchParams.set('preview','1');history.replaceState(null,'',url);
  const {demoData}=await import('/assets/demo.js' as string) as typeof import('./demo.ts');
  data=demoData();lastSnapshot=null;animations.clear();render();toast('Designvorschau aktiv. Feste Beispieldaten, keine Live-Messungen.');
}
document.addEventListener('click',e=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('button,[data-action]');if(!target)return;
  if(target.hasAttribute('data-close')){target.closest<HTMLDialogElement>('dialog')?.close();return;}
  if(target.dataset.view){setView(target.dataset.view);return;}
  if(target.dataset.range){range=target.dataset.range;all('[data-range]').forEach(el=>{el.classList.toggle('selected',el===target);el.setAttribute('aria-pressed',String(el===target));});if(preview)renderChart();else void refresh();return;}
  if(target.dataset.group){groupMode=target.dataset.group as 'country'|'language';showAllCountries=view!=='overview';languageFilter=null;render();return;}
  if(target.dataset.groupCode){
    if(groupMode==='country'){filter=target.dataset.groupCode;languageFilter=null;$<HTMLSelectElement>('#country-filter').value=filter;}
    else{languageFilter=target.dataset.groupCode;filter='all';$<HTMLSelectElement>('#country-filter').value='all';}
    visibleStreams=50;render();$('#stream-section').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});return;
  }
  switch(target.dataset.action){
    case'method':modal('#method-dialog');break;
    case'setup':modal('#setup-dialog');break;
    case'admin':modal('#admin-dialog');break;
    case'menu':$('#sidebar').classList.toggle('open');break;
    case'refresh':if(preview)toast('Designvorschau: Die Beispieldaten verändern sich nicht.');else void refresh(true);break;
    case'preview':void enablePreview();break;
    case'exit-preview':location.assign(location.pathname);break;
    case'all-countries':showAllCountries=!showAllCountries;renderGroups();break;
    case'more-streams':visibleStreams=visibleStreams===5?50:visibleStreams+50;renderStreams();break;
    case'reset':filter='all';languageFilter=null;query='';$<HTMLInputElement>('#search').value='';visibleStreams=5;render();break;
    case'export':exportMappings();break;
    case'lock':lockAdmin();break;
  }
});
$<HTMLInputElement>('#search').addEventListener('input',e=>{query=(e.target as HTMLInputElement).value.toLocaleLowerCase('de').trim();visibleStreams=50;renderStreams();});
$<HTMLSelectElement>('#country-filter').addEventListener('change',e=>{filter=(e.target as HTMLSelectElement).value;languageFilter=null;visibleStreams=50;renderStreams();renderGroups();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)&&!$('dialog[open]')){e.preventDefault();if(view==='languages'||view==='countries')setView('streamers');$<HTMLInputElement>('#search').focus();}if(e.key==='Escape')$('#sidebar').classList.remove('open');});
setInterval(()=>{if(!document.hidden&&!preview)void refresh();},10000);
setInterval(()=>{
  if(preview){$('#update-timer').textContent='Beispieldaten · kein Live-Abruf';return;}
  if(!data)return;
  const next=Math.max(0,Math.ceil((data.nextAttemptAt-Date.now())/1000));
  $('#update-timer').textContent=data.status==='unconfigured'?'Twitch-Verbindung ausstehend':next?`Nächste Erfassung in ${next} s`:'Nächste Erfassung wird vorbereitet';
},1000);

async function adminRequest(method='GET',body?:unknown){
  const response=await fetch('/api/admin/mappings',{method,headers:{Authorization:`Bearer ${adminToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const result=await response.json() as {error?:string;mappings?:typeof mappings;count?:number};
  if(!response.ok)throw new Error(result.error||'Anfrage fehlgeschlagen.');return result;
}
function lockAdmin(){adminToken='';$<HTMLInputElement>('#admin-token').value='';$('#admin-content').hidden=true;$('#admin-login').hidden=false;$('#mapping-list').innerHTML='';mappings=[];$('#admin-message').textContent='';}
async function loadMappings(){
  const result=await adminRequest();mappings=result.mappings||[];
  $('#mapping-list').innerHTML=mappings.length?mappings.map(m=>`<div class="mapping-entry"><div><strong>${escape(m.user_id)} · ${escape(flag(m.country_code)+' '+countryName(m.country_code))}</strong><small>${escape(m.note||'Keine Notiz')} · ${escape(time(m.updated_at,true))}</small></div><button data-delete="${escape(m.user_id)}">Löschen</button></div>`).join(''):'<p>Noch keine Zuordnungen gespeichert.</p>';
}
$('#admin-login').addEventListener('submit',async e=>{
  e.preventDefault();adminToken=$<HTMLInputElement>('#admin-token').value;$<HTMLInputElement>('#admin-token').value='';
  try{await loadMappings();$('#admin-login').hidden=true;$('#admin-content').hidden=false;$('#admin-message').textContent='Entsperrt. Der Token bleibt nur im Arbeitsspeicher dieser Seite.';}catch(e){adminToken='';$('#admin-message').textContent=(e as Error).message;}
});
$('#mapping-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$<HTMLButtonElement>('#mapping-form button');button.disabled=true;
  try{await adminRequest('PUT',{mappings:[{userId:$<HTMLInputElement>('#mapping-user').value.trim(),countryCode:$<HTMLInputElement>('#mapping-country').value.trim().toUpperCase(),note:$<HTMLInputElement>('#mapping-note').value.trim()}]});await loadMappings();$('#admin-message').textContent='Zuordnung gespeichert. Das Dashboard verwendet die aktualisierte Zuordnung.';void refresh();}catch(e){$('#admin-message').textContent=(e as Error).message;}finally{button.disabled=false;}
});
$('#mapping-list').addEventListener('click',async e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-delete]');if(!button)return;try{await adminRequest('DELETE',{userId:button.dataset.delete});await loadMappings();$('#admin-message').textContent='Zuordnung entfernt. Kanal wird als Unbekannt geführt.';void refresh();}catch(e){$('#admin-message').textContent=(e as Error).message;}});
$<HTMLInputElement>('#mapping-import').addEventListener('change',async e=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try{if(file.size>200000)throw new Error('Maximal 200 KB pro Import.');const parsed=JSON.parse(await file.text());const rows=Array.isArray(parsed)?parsed:parsed.mappings;const result=await adminRequest('PUT',{mappings:rows});await loadMappings();$('#admin-message').textContent=`${result.count} Zuordnungen importiert.`;void refresh();}catch(e){$('#admin-message').textContent=(e as Error).message;}finally{input.value='';}
});
function exportMappings(){const blob=new Blob([JSON.stringify({mappings:mappings.map(m=>({userId:m.user_id,countryCode:m.country_code,note:m.note}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='leonida-country-mappings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(preview)void enablePreview();else void refresh();
