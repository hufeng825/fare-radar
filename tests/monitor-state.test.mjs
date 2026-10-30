import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preserveDraftOnRefresh,dateFilterLabel,beyondSnapshotCoverage} from '../public/monitor-state.js';

const saved={homes:['HGH','SHA'],destinations:['OSA'],depart_start:'2027-01-01',depart_end:'2027-12-31',mode:'round',min_stay:3,max_stay:14,budget_cny:2000};
test('late refresh preserves dates edited while the request was in flight',async()=>{
 let form=structuredClone(saved),resolve;
 const started=structuredClone(form),savedBefore=structuredClone(saved);
 const response=new Promise(r=>resolve=r);
 const refresh=response.then(incoming=>{if(!preserveDraftOnRefresh(started,form,savedBefore))form=structuredClone(incoming);});
 form={...form,depart_start:'2027-06-01',depart_end:'2027-06-30'};
 resolve(saved);await refresh;
 assert.equal(form.depart_start,'2027-06-01');assert.equal(form.depart_end,'2027-06-30');
});
test('existing drafts and incomplete native date edits are preserved',()=>{
 const draft={...saved,depart_start:'2027-07-01'};
 assert.equal(preserveDraftOnRefresh(draft,draft,saved),true);
 assert.equal(preserveDraftOnRefresh(saved,{...saved,depart_start:''},saved),true);
});
test('untouched forms can receive new cloud rules',()=>{
 assert.equal(preserveDraftOnRefresh(saved,structuredClone(saved),saved),false);
 assert.equal(preserveDraftOnRefresh(null,null,null),false);
});
test('result range and coverage follow the selected custom dates',()=>{
 const june={...saved,depart_start:'2027-06-01',depart_end:'2027-06-30'};
 assert.equal(dateFilterLabel(june),'2027-06-01 至 2027-06-30 出发 · 停留 3–14 天');
 assert.equal(beyondSnapshotCoverage(june,{coverage_end:'2027-06-29'}),true);
 assert.equal(beyondSnapshotCoverage(june,{coverage_end:'2027-06-30'}),false);
});
