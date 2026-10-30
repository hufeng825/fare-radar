import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchDestinations,policySignature} from '../public/destinations.js';
const cities=JSON.parse(fs.readFileSync(new URL('../public/data/destinations.json',import.meta.url))).cities;

test('custom destination search finds Chinese, English and city codes',()=>{
 for(const query of ['仙台','Sendai','sdj'])assert.equal(searchDestinations(cities,query)[0].code,'SDJ');
 assert.equal(searchDestinations(cities,'nrt')[0].code,'TYO');
 assert.equal(searchDestinations(cities,'kix')[0].code,'OSA');
 assert.equal(searchDestinations(cities,'不存在的机场').length,0);
});
test('search excludes home cities, returns bounded suggestions and preserves disambiguation',()=>{
 assert.equal(searchDestinations(cities,'HGH').length,0);
 const rows=searchDestinations(cities,'日本',5);assert.equal(rows.length,5);
 assert.ok(rows.every(r=>r.region==='日本'&&r.code&&r.name));
});
test('draft comparison ignores key and watchlist order but detects real rule changes',()=>{
 const a={homes:['HGH','SHA'],destinations:['OSA','SDJ'],budget_cny:2000};
 assert.equal(policySignature(a),policySignature({budget_cny:2000,destinations:['SDJ','OSA'],homes:['SHA','HGH']}));
 assert.notEqual(policySignature(a),policySignature({...a,destinations:['OSA']}));
});
