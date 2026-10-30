export const MAX_DESTINATIONS=12;
export function searchDestinations(cities,query,limit=8){
 const q=query.trim().toLocaleLowerCase();
 if(!q)return [];
 return Object.entries(cities).filter(([code,c])=>!["HGH","SHA"].includes(code))
  .map(([code,c])=>({code,...c,score:code.toLowerCase()===q||c.name.toLowerCase()===q?0:(c.airports||[]).some(a=>a.toLowerCase()===q)?1:c.name.toLowerCase().startsWith(q)||c.en.toLowerCase().startsWith(q)?2:3}))
  .filter(c=>[c.code,c.name,c.en,c.region,...(c.airports||[])].join(' ').toLocaleLowerCase().includes(q))
  .sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,'zh-CN')).slice(0,limit);
}

export function policySignature(c){
 return JSON.stringify(Object.fromEntries(Object.keys(c).sort().map(k=>[k,Array.isArray(c[k])?[...c[k]].sort():c[k]])));
}
