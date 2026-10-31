// One shared request and snapshot for monitoring and browsing.
export function createFareData(fetchSnapshot){
 let value=null,pending=null;
 const listeners=new Set();
 function notify(event){for(const listener of listeners)listener(event);}
 return {
  subscribe(listener){listeners.add(listener);if(value)listener({status:'ready',snapshot:value});return()=>listeners.delete(listener);},
  load(force=false){
   if(pending)return pending;
   if(value&&!force)return Promise.resolve(value);
   notify({status:'loading'});
   pending=Promise.resolve().then(fetchSnapshot).then(snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.fares))throw Error('无效票价快照');
    value=snapshot;notify({status:'ready',snapshot});return snapshot;
   }).catch(error=>{notify({status:'error'});throw error;}).finally(()=>{pending=null;});
   return pending;
  }
 };
}
export const fareData=createFareData(async()=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch('./data/fares.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('票价读取失败');return await response.json();}
 finally{clearTimeout(timer);}
});
