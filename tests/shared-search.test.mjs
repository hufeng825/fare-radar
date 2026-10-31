import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDateState,withinDateWindow} from '../public/date-state.js';
import {createFareData} from '../public/fare-data.js';

test('dates selected in either workspace update both views and exclude old dates',()=>{
 const store=createDateState();let monitor=null,browse=null;
 store.subscribe(r=>{monitor=r;});store.subscribe(r=>{browse=r;});
 store.set({start:'2027-06-01',end:'2027-06-30'},'monitor');
 assert.deepEqual(monitor,browse);
 assert.equal(withinDateWindow('2026-11-03',browse),false);
 assert.equal(withinDateWindow('2027-06-12',browse),true);
 store.set({start:'2027-07-01',end:'2027-07-31'},'explore');
 assert.deepEqual(monitor,{start:'2027-07-01',end:'2027-07-31'});
 assert.equal(withinDateWindow('2027-06-12',monitor),false);
});
test('late startup defaults cannot replace a committed custom date window',()=>{
 const store=createDateState({start:'2027-06-01',end:'2027-06-30'});
 store.set({start:'2026-11-01',end:'2026-11-30'},'explore',0);
 store.set({start:'2027-01-01',end:'2027-12-31'},'monitor',1);
 assert.deepEqual(store.read(),{start:'2027-06-01',end:'2027-06-30'});
});
test('incomplete and reversed date windows reject all old result dates',()=>{
 const store=createDateState();store.set({start:'',end:'2027-06-30'},'monitor');
 assert.equal(withinDateWindow('2027-06-01',store.read()),false);
 assert.equal(withinDateWindow('2027-06-01',{start:'2027-06-30',end:'2027-06-01'}),false);
});
test('both workspaces share one in-flight fetch and receive the same fresh snapshot',async()=>{
 let calls=0,resolve;const seen=[[],[]];
 const store=createFareData(()=>{calls++;return new Promise(r=>resolve=r);});
 store.subscribe(e=>seen[0].push(e));store.subscribe(e=>seen[1].push(e));
 const one=store.load(),two=store.load();await Promise.resolve();
 assert.equal(calls,1);assert.equal(one,two);
 const first={updated_at:'2026-10-31',fares:[{date:'2027-06-01'}]};resolve(first);await one;
 assert.equal(seen[0].at(-1).snapshot,first);assert.equal(seen[1].at(-1).snapshot,first);
 const refreshed=store.load(true);await Promise.resolve();
 assert.equal(calls,2);assert.equal(seen[0].at(-1).status,'loading');
 const next={updated_at:'2026-11-01',fares:[{date:'2027-07-01'}]};resolve(next);await refreshed;
 assert.equal(seen[0].at(-1).snapshot,next);assert.equal(seen[1].at(-1).snapshot,next);
});
test('failed refresh tells both views to clear prices, and the next attempt can recover',async()=>{
 let fail=true;const statuses=[];
 const store=createFareData(async()=>{if(fail)throw Error('offline');return {fares:[]};});
 store.subscribe(e=>statuses.push(e.status));
 await assert.rejects(store.load());assert.deepEqual(statuses,['loading','error']);
 fail=false;await store.load(true);assert.equal(statuses.at(-1),'ready');
});
