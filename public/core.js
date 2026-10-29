export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());}
export function dayDiff(a,b){return Math.round((Date.parse(b.slice(0,10)+'T00:00:00Z')-Date.parse(a.slice(0,10)+'T00:00:00Z'))/86400000);}
export function filterFares(fares,s,cities,now=Date.now()){
 return fares.filter(f=>Number.isFinite(f.price)&&f.price>0&&f.currency==='CNY'&&f.date>=s.start&&f.date<=s.end&&f.price<=s.budget&&(!s.direct||f.stops===0)&&(!s.home||(s.direction==='back'?f.destination:f.origin)===s.home)&&(s.direction==='back'?['HGH','SHA'].includes(f.destination):['HGH','SHA'].includes(f.origin))&&(!s.region||cities[s.direction==='back'?f.origin:f.destination]?.region===s.region)&&Number.isFinite(Date.parse(f.found_at))&&now-Date.parse(f.found_at)<=48*3600000&&Date.parse(f.found_at)<=now);
}
export function pairFares(outbound,all,s,now=Date.now()){
 return outbound.flatMap(a=>all.filter(b=>b.origin===a.destination&&b.destination===a.origin&&dayDiff(a.date,b.date)>=s.minStay&&dayDiff(a.date,b.date)<=s.maxStay&&b.price<=s.budget&&b.currency==='CNY'&&b.price>0&&Number.isFinite(b.price)&&(!s.direct||b.stops===0)&&Number.isFinite(Date.parse(b.found_at))&&now-Date.parse(b.found_at)<=48*3600000&&Date.parse(b.found_at)<=now).map(b=>({...a,returnFare:b,total:a.price+b.price}))).sort((a,b)=>a.total-b.total);
}

export function dateAfter(base,days){
 const d=new Date(base+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
// Google Flights structured search. SHA is a metro in our data, not Hongqiao only.
export function googleFlightLink(cities,origin,destination,date,returnDate=null){
 const v=n=>{const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return a;};
 const msg=(field,bytes)=>[...v(field*8+2),...v(bytes.length),...bytes];
 const str=(field,value)=>msg(field,[...new TextEncoder().encode(value)]);
 const place=code=>code==='SHA'?[8,3,...str(2,'/m/06wjf')]:[8,1,...str(2,code)];
 const leg=(a,b,d)=>msg(3,[...str(2,d),...msg(13,place(a)),...msg(14,place(b))]);
 const bytes=[8,28,16,2,...leg(origin,destination,date),...(returnDate?leg(destination,origin,returnDate):[]),64,1,72,1,152,1,returnDate?1:2];
 const tfs=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const url=new URL('https://www.google.com/travel/flights/search');
 url.search=new URLSearchParams({tfs,hl:'zh-CN',curr:'CNY',gl:'CN'}).toString();return url.href;
}
