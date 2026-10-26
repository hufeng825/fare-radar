export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());}
export function dayDiff(a,b){return Math.round((Date.parse(b.slice(0,10)+'T00:00:00Z')-Date.parse(a.slice(0,10)+'T00:00:00Z'))/86400000);}
export function filterFares(fares,s,cities,now=Date.now()){
 return fares.filter(f=>Number.isFinite(f.price)&&f.price>0&&f.currency==='CNY'&&f.date>=s.start&&f.date<=s.end&&f.price<=s.budget&&(!s.direct||f.stops===0)&&(!s.home||(s.direction==='back'?f.destination:f.origin)===s.home)&&(s.direction==='back'?['HGH','SHA'].includes(f.destination):['HGH','SHA'].includes(f.origin))&&(!s.region||cities[s.direction==='back'?f.origin:f.destination]?.region===s.region)&&Number.isFinite(Date.parse(f.found_at))&&now-Date.parse(f.found_at)<=48*3600000&&Date.parse(f.found_at)<=now);
}
export function pairFares(outbound,all,s,now=Date.now()){
 return outbound.flatMap(a=>all.filter(b=>b.origin===a.destination&&b.destination===a.origin&&dayDiff(a.date,b.date)>=s.minStay&&dayDiff(a.date,b.date)<=s.maxStay&&b.price<=s.budget&&b.currency==='CNY'&&b.price>0&&Number.isFinite(b.price)&&(!s.direct||b.stops===0)&&Number.isFinite(Date.parse(b.found_at))&&now-Date.parse(b.found_at)<=48*3600000&&Date.parse(b.found_at)<=now).map(b=>({...a,returnFare:b,total:a.price+b.price}))).sort((a,b)=>a.total-b.total);
}
