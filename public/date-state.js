// Both workspaces use one date window; cloud notification rules remain separate.
export function createDateState(initial=null){
 let current=initial,priority=initial?2:-1;
 const listeners=new Set();
 return {
  read:()=>current?{...current}:null,
  committed:()=>priority===2,
  set(range,source,rank=2){
   if(rank<priority||!range||!['start','end'].every(k=>typeof range[k]==='string'))return false;
   const same=current&&range.start===current.start&&range.end===current.end;
   if(same&&rank===priority)return false;
   current={start:range.start,end:range.end};priority=rank;
   for(const fn of listeners)fn({...current},source,rank);
   return true;
  },
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
 };
}

export function withinDateWindow(date,range){
 return Boolean(range&&/^\d{4}-\d{2}-\d{2}$/.test(range.start)&&/^\d{4}-\d{2}-\d{2}$/.test(range.end)&&range.start<=range.end&&date>=range.start&&date<=range.end);
}

let stored=null;
try{const v=typeof window==='undefined'?null:JSON.parse(localStorage.getItem('fare-shared-date-window'));if(v&&withinDateWindow(v.start,v))stored=v;}catch{}
export const dateState=createDateState(stored);
dateState.subscribe((range,source,rank)=>{if(rank===2&&withinDateWindow(range.start,range)){try{localStorage.setItem('fare-shared-date-window',JSON.stringify(range));}catch{}}});
