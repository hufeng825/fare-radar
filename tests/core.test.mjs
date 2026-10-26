import {test} from 'node:test';import assert from 'node:assert/strict';import {filterFares,pairFares} from '../public/core.js';
const now=Date.parse('2026-10-26T12:00:00Z'),cities={HGH:{region:'中国'},OSA:{region:'日本'},SHA:{region:'中国'}};
const fare={origin:'HGH',destination:'OSA',date:'2026-11-01',price:300,currency:'CNY',stops:0,found_at:'2026-10-26T10:00:00Z'};
const s={home:'HGH',direction:'out',region:'日本',start:'2026-10-27',end:'2026-11-30',budget:500,direct:true,minStay:3,maxStay:10};
test('filters reject stale, wrong currency, over-budget and connecting fares',()=>{assert.equal(filterFares([fare,{...fare,price:800},{...fare,currency:'RUB'},{...fare,stops:1},{...fare,found_at:'2026-10-20T00:00:00Z'}],s,cities,now).length,1)});
test('return direction uses domestic destination',()=>{assert.equal(filterFares([{...fare,origin:'OSA',destination:'HGH'}],{...s,direction:'back'},cities,now).length,1)});
test('round trips respect route, stay length, freshness, and both prices',()=>{const back={...fare,origin:'OSA',destination:'HGH',date:'2026-11-06',price:400};const pairs=pairFares([fare],[back,{...back,destination:'SHA'},{...back,date:'2026-11-02'},{...back,price:600},{...back,found_at:'2026-10-01T00:00:00Z'}],s,now);assert.equal(pairs.length,1);assert.equal(pairs[0].total,700)});
