import {today,dateAfter,dayDiff,googleFlightLink} from './core.js?v=20261030b';
import {searchDestinations,policySignature,MAX_DESTINATIONS} from './destinations.js?v=20261030b';
import {preserveDraftOnRefresh,dateFilterLabel,beyondSnapshotCoverage} from './monitor-state.js?v=20261030d';
const $=id=>document.getElementById(id),repo='hufeng825/fare-radar',storageKey='fare-watch-draft-v2';
let cities={},routeConfig,snapshot={fares:[],status:"loading",updated_at:null},saved,known={},watched=new Set(),ready=false,loading=false,catalogReady=false,faresLoading=true;
const fields={'monitor-budget':'budget_cny','monitor-leg-budget':'per_leg_budget_cny','monitor-min-stay':'min_stay','monitor-max-stay':'max_stay','monitor-drop':'min_drop_cny','monitor-daily':'max_digests_per_day','monitor-items':'max_items_per_digest','monitor-per-route':'max_per_route'};
const toggles={'monitor-enabled':'enabled','monitor-direct':'direct_only','monitor-wechat':'wechat_enabled','monitor-email':'email_enabled'};
function selected(id){return [...$(id).querySelectorAll('input:checked')].map(x=>x.value);}
function draft(){const c={homes:selected('monitor-homes'),destinations:[...watched],mode:$('monitor-mode').value,depart_start:$('monitor-start').value,depart_end:$('monitor-end').value};for(const [id,key]of Object.entries(fields))c[key]=+$(id).value;for(const [id,key]of Object.entries(toggles))c[key]=$(id).checked;return c;}
function dirty(c=draft()){return saved&&policySignature(c)!==policySignature(saved);}
function fill(c){watched=new Set(c.destinations);for(const x of $('monitor-homes').querySelectorAll('input'))x.checked=c.homes.includes(x.value);for(const [id,key]of Object.entries(fields))$(id).value=c[key];for(const [id,key]of Object.entries(toggles))$(id).checked=c[key];$('monitor-mode').value=c.mode;$('monitor-start').value=c.depart_start;$('monitor-end').value=c.depart_end;$('monitor-period').value=(c.depart_start===`${+today().slice(0,4)+1}-01-01`&&c.depart_end===`${+today().slice(0,4)+1}-12-31`)?'next-year':'custom';updateMode();renderWatched();}
function updateMode(){$('monitor-budget-label').textContent=$('monitor-mode').value==='round'?'往返总预算（元）':'单程总预算（元）';for(const id of ['monitor-min-stay','monitor-max-stay'])$(id).disabled=$('monitor-mode').value!=='round';}
function names(xs){return xs.map(x=>cities[x]?.name||x).join(' / ');}
function summarize(c){return `${names(c.homes)} ${c.mode==='round'?'⇄':c.mode==='back'?'←':'→'} ${names(c.destinations)} · ${c.depart_start} 至 ${c.depart_end} · ${c.mode==='round'?'往返':'单程'} ≤ ¥${c.budget_cny} / 每程 ≤ ¥${c.per_leg_budget_cny} · ${c.mode==='round'?`停留 ${c.min_stay}–${c.max_stay} 天 · `:''}${c.wechat_enabled?'微信开启':'微信关闭'} · 每天最多 ${c.max_digests_per_day} 次`;}
function check(c){if(!$('monitor-form').checkValidity())throw Error('请填写有效的预算、日期和停留天数。');if(!c.homes.length||!c.destinations.length)throw Error('请选择出发城市，并至少添加一个关注目的地。');if(c.destinations.length>MAX_DESTINATIONS)throw Error('最多关注 12 个目的地。');if(c.destinations.some(d=>!known[d]&&!routeConfig.cities[d]))throw Error('目的地不在城市目录中，请重新搜索添加。');if(c.depart_start>c.depart_end||c.depart_end>dateAfter(today(),730)||c.depart_end<today())throw Error('请选择有效的出发日期，最晚可到今天起两年内。');if(c.min_stay>c.max_stay)throw Error('最少停留天数不能大于最多停留天数。');return true;}
function element(tag,value,cls){const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;}
function searchAction(label,url){const a=element('a',label);a.href=url;a.target='_blank';a.rel='noreferrer';return a;}
function renderWatched(){
 $('monitor-destinations').replaceChildren();$('destination-count').textContent=watched.size+' / '+MAX_DESTINATIONS;
 if(!watched.size)$('monitor-destinations').append(element('p','还没选好？从上方搜索或下方常用城市添加。','monitor-help'));
 for(const code of watched){const b=element('button',`${names([code])} ${code} ×`,'destination-chip');b.type='button';b.setAttribute('aria-label','取消关注'+names([code])+' '+code);b.addEventListener('click',()=>{watched.delete(code);renderWatched();renderSuggestions();preview();});$('monitor-destinations').append(b);}
 $('destination-popular').replaceChildren();for(const code of ['TYO','OSA','SDJ','HIJ','FUK','SPK','OKA','HKG','SEL','PUS','CJU','BKK','SIN','TPE']){if(!known[code])continue;const b=element('button',(watched.has(code)?'✓ ':'＋ ')+names([code]),'popular-chip');b.type='button';b.disabled=watched.has(code);b.addEventListener('click',()=>addDestination(code));$('destination-popular').append(b);}
}
function addDestination(code){
 if(watched.has(code))return;
 if(watched.size>=MAX_DESTINATIONS){$('destination-status').textContent='最多关注 12 个目的地，请先移除一个城市。';return;}
 watched.add(code);$('destination-query').value='';$('destination-status').textContent='已添加'+names([code])+'；当前为本机草稿，尚未修改微信提醒。';renderWatched();renderSuggestions();preview();$('destination-query').focus();
}
function renderSuggestions(){
 const q=$('destination-query').value.trim(),box=$('destination-suggestions');box.replaceChildren();box.hidden=!q;if(!q)return;
 const rows=searchDestinations(known,q);if(!rows.length){box.append(element('p',catalogReady?'未找到该城市。可试英文名或机场三字代码；请从目录结果中添加。':'完整城市目录正在加载，完成后会自动显示搜索结果。'));return;}
 for(const c of rows){const b=element('button',undefined,'destination-option');b.type='button';b.append(element('strong',c.name+' '+c.code),element('span',`${c.region} · ${c.en}${c.airports.length?' · '+c.airports.slice(0,4).join(' / '):''}`),element('small',watched.has(c.code)?'已关注':'＋ 关注'));b.disabled=watched.has(c.code);b.addEventListener('click',()=>addDestination(c.code));box.append(b);}
}
function remember(c){try{if(dirty(c))localStorage.setItem(storageKey,JSON.stringify({base:policySignature(saved),policy:c}));else localStorage.removeItem(storageKey);}catch{}}
async function json(url,timeout=30000,cache="no-store"){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch(url,{cache,signal:controller.signal});if(!r.ok)throw Error('读取失败');return await r.json();}finally{clearTimeout(timer);}}
async function load(refresh=true){
 if(loading)return;loading=true;$('reload-policy').disabled=true;const started=ready?draft():null,savedBefore=saved;
 try{
  if(ready&&refresh)await loadFares();
  let c,cloud=true;
  try{const payload=await json(`https://api.github.com/repos/${repo}/contents/notifications.json?t=${Date.now()}`,8000);c=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.content.replace(/\s/g,'')),x=>x.charCodeAt(0))));if(!Array.isArray(c.destinations))throw Error();}
  catch{cloud=false;try{c=await json('./data/monitor.json?t='+Date.now());}catch{if(!saved)throw Error('无法读取规则');c=saved;}}
  const keepDraft=preserveDraftOnRefresh(started,ready?draft():null,savedBefore);
  saved=c;
  if(!keepDraft)fill(c);$('saved-policy').textContent=(cloud?'云端正在执行：':'云端暂不可读；上次已保存规则：')+summarize(c);ready=true;$('monitor-controls').disabled=false;preview();
 }catch{$('monitor-feedback').textContent='读取失败，请检查网络后重试。已有草稿没有提交到后台。';}
 finally{loading=false;$('reload-policy').disabled=false;}
}
function opportunities(c){const now=Date.now();let fares=snapshot.fares.filter(f=>f.currency==='CNY'&&f.price>0&&f.price<=c.per_leg_budget_cny&&Number.isFinite(f.price)&&f.date>=today()&&(!c.direct_only||f.stops===0)&&0<=now-Date.parse(f.found_at)&&now-Date.parse(f.found_at)<=48*3600000);const outbound=fares.filter(f=>c.homes.includes(f.origin)&&c.destinations.includes(f.destination)&&f.date>=c.depart_start&&f.date<=c.depart_end);
if(c.mode==='out')return outbound.filter(f=>f.price<=c.budget_cny);
if(c.mode==='back')return fares.filter(f=>c.destinations.includes(f.origin)&&c.homes.includes(f.destination)&&f.date>=c.depart_start&&f.date<=c.depart_end&&f.price<=c.budget_cny);
return outbound.flatMap(a=>fares.filter(b=>b.origin===a.destination&&b.destination===a.origin&&dayDiff(a.date,b.date)>=c.min_stay&&dayDiff(a.date,b.date)<=c.max_stay&&a.price+b.price<=c.budget_cny).map(b=>({...a,price:a.price+b.price,returnFare:b}))).sort((a,b)=>a.price-b.price);}
function renderMatch(f,outside=false){
 const card=element('article',undefined,'monitor-preview-row');
 const trip=element('div');trip.append(element('h4',`${names([f.origin])} ${f.returnFare?'⇄':'→'} ${names([f.destination])}`));
 trip.append(element('p',`${f.date}${f.returnFare?' 出发 · '+f.returnFare.date+' 返回 · '+dayDiff(f.date,f.returnFare.date)+' 天':''}`));
 if(f.returnFare)trip.append(element('p',`去程 ¥${f.price-f.returnFare.price} + 返程 ¥${f.returnFare.price} · 独立单程组合`));
 trip.append(element('p',outside?'预算外参考，不会推送':'符合本次查看条件'));
 const booking=element('div');booking.append(element('div','¥'+Math.round(f.price),'match-price'));
 const a=searchAction(f.returnFare?'查此往返 ↗':'查此单程 ↗',googleFlightLink(cities,f.origin,f.destination,f.date,f.returnFare?.date));a.className='match-book';booking.append(a);
 const detail=element('details',undefined,'match-detail');detail.append(element('summary','分程核实 / 复制行程'));
 detail.append(element('p',`缓存发现：${new Date(f.found_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}；税费、行李与实际可购价请复核。`));
 detail.append(searchAction('单独核实去程 ↗',googleFlightLink(cities,f.origin,f.destination,f.date)));
 if(f.returnFare)detail.append(searchAction('单独核实返程 ↗',googleFlightLink(cities,f.destination,f.origin,f.returnFare.date)));
 const copy=element('button','复制行程','secondary');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`${names([f.origin])} ${f.returnFare?'⇄':'→'} ${names([f.destination])}\n${f.date}${f.returnFare?' / '+f.returnFare.date:''}\n缓存报价 ¥${f.price}\n${a.href}`);copy.textContent='已复制';}catch{copy.textContent='复制失败，可直接打开链接';}});detail.append(copy);
 card.append(trip,booking,detail);return card;
}

function preview(){
 if(!ready)return;
 const c=draft(),changed=dirty(c);remember(c);
 $('monitor-applied').textContent='当前筛选：'+dateFilterLabel(c);
 $('date-preview-status').textContent='已按当前日期筛选 · '+new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
 $('watch-state').textContent=`${saved.enabled?'监控开启':'监控暂停'} · ${saved.wechat_enabled?'微信提醒开启':'微信提醒关闭'}${changed?' · 有未同步修改':''}`;
 $('draft-state').textContent=changed?'本机草稿 · 尚未同步微信':'已与云端规则一致';$('reset-policy').disabled=!changed;$('save-policy').disabled=!changed;
 $('monitor-preview').replaceChildren();
 try{check(c);}catch(e){$('monitor-feedback').textContent=e.message;$('date-preview-status').textContent='日期或条件尚未填完整，旧结果已清除';$('save-policy').disabled=true;return;}
 const age=Date.now()-Date.parse(snapshot.updated_at);$('watch-health').textContent=faresLoading?'正在读取最新票价快照…':!Number.isFinite(age)||age>24*3600000?'当前快照已过期，等待后台更新；不会把旧报价当作新低价提醒。':`更新于 ${new Date(snapshot.updated_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · 后台约每 6 小时查价`;
 const rows=opportunities(c).sort((a,b)=>a.price-b.price),dates=new Set();
 const distinct=rows.filter(f=>{const k=[f.origin,f.destination,f.date].join('-');if(dates.has(k))return false;dates.add(k);return true;});
 $('monitor-feedback').textContent=faresLoading?'正在读取票价，可先编辑目的地和条件。':snapshot.status==='error'?'票价暂时读取失败，请点击刷新重试。关注草稿仍可正常编辑。':distinct.length?`找到 ${distinct.length} 个出发日期，同一天保留最便宜组合。${changed?'当前为草稿预览。':''}`:'当前日期范围内暂无完全符合条件的新鲜报价。';
 if(!faresLoading&&beyondSnapshotCoverage(c,snapshot))$('monitor-preview').append(element('p',`所选日期超出当前票价覆盖（至 ${snapshot.coverage_end}）。请同步保存监控条件，等待后台采集；也可使用下方的直接查票入口。`,'pending-destinations'));
 const newCities=c.destinations.filter(d=>!routeConfig.routes.some(([a,b])=>c.homes.includes(a)&&b===d));
 if(newCities.length)$('monitor-preview').append(element('p',`${names(newCities)} 尚未纳入这份快照。同步保存后后台会尝试采集；下方可先手动查票。`,'pending-destinations'));
 if(distinct.length){const buckets=new Map();for(const f of distinct){const k=f.origin+'-'+f.destination;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(f);}let count=0;for(let i=0;i<3;i++)for(const group of buckets.values())if(group[i]&&count++<12)$('monitor-preview').append(renderMatch(group[i]));}
 else{
  const alternative=opportunities({...c,budget_cny:100000,per_leg_budget_cny:100000}).sort((a,b)=>a.price-b.price)[0];
  const box=element('div',undefined,'empty-match');box.append(element('h4',faresLoading?'票价正在载入…':snapshot.status==='error'?'暂时无法读取报价':alternative?'相同条件下，有预算外的参考':'先关注起来，等好价格出现'));
  box.append(element('p',faresLoading?'目的地、日期和预算已可编辑，结果加载完成后会自动更新。':snapshot.status==='error'?'可以稍后刷新票价，也可以使用下方的直接查票入口。':alternative?`目前缓存最低约 ¥${alternative.price}；你的总预算 ¥${c.budget_cny}，每程最多 ¥${c.per_leg_budget_cny}。`:'免费缓存不覆盖全部航班。可以调整日期和停留天数，也可以直接去查票。'));
  if(alternative){const b=element('button','按参考价格预览','secondary');b.type='button';b.addEventListener('click',()=>{$('monitor-budget').value=Math.ceil(alternative.price/100)*100;$('monitor-leg-budget').value=Math.ceil(Math.max(alternative.returnFare?.price||alternative.price,alternative.returnFare?alternative.price-alternative.returnFare.price:0)/100)*100;preview();});box.append(b);}
  $('monitor-preview').append(box);if(alternative)$('monitor-preview').append(renderMatch(alternative,true));
 }
 const manual=element('details',undefined,'manual-search');manual.append(element('summary','直接查关注目的地的机票 ↗'));
 const d=c.depart_start<today()?today():c.depart_start,back=c.mode==='round'?dateAfter(d,c.min_stay):null;
 manual.append(element('p',`以下为示例日期 ${d}${back?' / '+back:''} 的搜索入口，不代表有此报价，可在购票页继续改日期。`));
 for(const dest of c.destinations)for(const home of c.homes){const a=c.mode==='back'?dest:home,b=c.mode==='back'?home:dest;manual.append(searchAction(`${names([a])} ${back?'⇄':'→'} ${names([b])} ↗`,googleFlightLink(cities,a,b,d,back)));}
 $('monitor-preview').append(manual);
}
function showWorkspace(name){document.querySelector('.monitor-panel').hidden=name!=='monitor';$('explore-panel').hidden=name!=='explore';for(const n of ['monitor','explore']){$('tab-'+n).classList.toggle('active',n===name);$('tab-'+n).setAttribute('aria-pressed',String(n===name));}}
for(const name of ['monitor','explore'])$('tab-'+name).addEventListener('click',()=>showWorkspace(name));
document.querySelector('.settings-link').addEventListener('click',e=>{e.preventDefault();showWorkspace('monitor');$('monitor-heading').scrollIntoView({behavior:'smooth'});});
$('destination-query').addEventListener('input',renderSuggestions);$('destination-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const first=$('destination-suggestions').querySelector('button:not(:disabled)');if(first)first.click();}if(e.key==='Escape'){$('destination-query').value='';renderSuggestions();}});
$('clear-destinations').addEventListener('click',()=>{watched.clear();renderWatched();renderSuggestions();preview();});
$('reset-policy').addEventListener('click',()=>{fill(saved);$('destination-status').textContent='已恢复云端保存的关注列表和条件。';preview();});
$('monitor-form').addEventListener('submit',e=>{e.preventDefault();try{const c=draft();check(c);if(!dirty(c))return;const body='由候鸟机票雷达配置页面提交。仅仓库主人提交的配置会被自动应用。\n\n```json\n'+JSON.stringify(c,null,2)+'\n```';const url=`https://github.com/${repo}/issues/new?`+new URLSearchParams({title:'候鸟配置：更新监控规则',body});window.open(url,'_blank','noopener,noreferrer');$('draft-state').textContent='请在新打开的 GitHub 页面点击 Create 确认保存；完成后回来刷新规则。';}catch(e){$('draft-state').textContent=e.message;}});
$('monitor-mode').addEventListener('change',updateMode);
$('monitor-period').addEventListener('change',()=>{const v=$('monitor-period').value;if(v==='next-year'){const y=+today().slice(0,4)+1;$('monitor-start').value=`${y}-01-01`;$('monitor-end').value=`${y}-12-31`;}else if(v!=='custom'){$('monitor-start').value=today();$('monitor-end').value=dateAfter(today(),+v);}});
for(const id of ['monitor-start','monitor-end']){for(const event of ['input','change'])$(id).addEventListener(event,()=>{$('monitor-period').value='custom';preview();});}
$('apply-dates').addEventListener('click',()=>{preview();$('match-heading').scrollIntoView({behavior:'smooth'});});
$('monitor-form').addEventListener('change',()=>preview());let timer;$('monitor-form').addEventListener('input',e=>{if(['destination-query','monitor-start','monitor-end'].includes(e.target.id))return;clearTimeout(timer);timer=setTimeout(preview,250);});$('reload-policy').addEventListener('click',()=>{if(!routeConfig)location.reload();else{load();if(!catalogReady)loadCatalog();}});
async function loadCatalog(){
 $('reload-destinations').hidden=true;
 try{const catalog=await json('./data/destinations.json?v=20261030b',30000,'force-cache');known=catalog.cities;cities={...known,...routeConfig.cities};catalogReady=true;$('destination-help').textContent=`支持 ${Object.keys(known).length.toLocaleString('zh-CN')} 个城市，可搜索中文、英文或机场代码。最多关注 12 个。`;renderWatched();renderSuggestions();preview();}
 catch{$('destination-help').textContent='完整城市目录暂未载入，现有关注仍可编辑。请重试后再搜索新城市。';$('reload-destinations').hidden=false;}
}
async function loadFares(){
 faresLoading=true;preview();
 try{snapshot=await json('./data/fares.json?t='+Date.now());}
 catch{snapshot={fares:[],status:'error',updated_at:null};}
 finally{faresLoading=false;preview();}
}
$('reload-destinations').addEventListener('click',loadCatalog);
try{
 const [config,deployed]=await Promise.all(['config','monitor'].map(n=>json(`./data/${n}.json?t=${Date.now()}`)));routeConfig=config;saved=deployed;
 known=Object.fromEntries(Object.entries(config.cities).map(([code,c])=>[code,{...c,en:c.name,airports:[]}]));cities={...known};
 for(const code of ['HGH','SHA']){const label=element('label'),input=document.createElement('input');input.type='checkbox';input.value=code;label.append(input,document.createTextNode(cities[code].name));$('monitor-homes').append(label);}
 for(const id of ['monitor-start','monitor-end'])$(id).max=dateAfter(today(),730);
 let initial=deployed;try{const d=JSON.parse(localStorage.getItem(storageKey));if(d?.base===policySignature(deployed)){initial=d.policy;$('destination-status').textContent='已恢复上次未同步的本机草稿。';}else localStorage.removeItem(storageKey);}catch{}
 fill(initial);ready=true;$('monitor-controls').disabled=false;$('saved-policy').textContent='上次部署保存的规则：'+summarize(deployed);preview();
 await Promise.allSettled([loadCatalog(),loadFares(),load(false)]);
}catch{$('saved-policy').textContent='基本配置读取失败，请点击刷新重试。';$('monitor-feedback').textContent='无法读取页面数据，请检查网络后重试。';}
