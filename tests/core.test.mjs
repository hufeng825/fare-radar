import {test} from 'node:test';import assert from 'node:assert/strict';import {filterFares,pairFares} from '../public/core.js';
const now=Date.parse('2026-10-26T12:00:00Z'),cities={HGH:{region:'中国'},OSA:{region:'日本'},SHA:{region:'中国'}};
const fare={origin:'HGH',destination:'OSA',date:'2026-11-01',price:300,currency:'CNY',stops:0,found_at:'2026-10-26T10:00:00Z'};
const s={home:'HGH',direction:'out',region:'日本',start:'2026-10-27',end:'2026-11-30',budget:500,direct:true,minStay:3,maxStay:10};
test('filters reject stale, wrong currency, over-budget and connecting fares',()=>{assert.equal(filterFares([fare,{...fare,price:800},{...fare,currency:'RUB'},{...fare,stops:1},{...fare,found_at:'2026-10-20T00:00:00Z'}],s,cities,now).length,1)});
test('return direction uses domestic destination',()=>{assert.equal(filterFares([{...fare,origin:'OSA',destination:'HGH'}],{...s,direction:'back'},cities,now).length,1)});
test('round trips respect route, stay length, freshness, and both prices',()=>{const back={...fare,origin:'OSA',destination:'HGH',date:'2026-11-06',price:400};const pairs=pairFares([fare],[back,{...back,destination:'SHA'},{...back,date:'2026-11-02'},{...back,price:600},{...back,found_at:'2026-10-01T00:00:00Z'}],s,now);assert.equal(pairs.length,1);assert.equal(pairs[0].total,700)});

import {dateAfter,googleFlightLink} from '../public/core.js';
test('date presets cross month/year boundaries without timezone shifts',()=>{assert.equal(dateAfter('2026-10-26',30),'2026-11-25');assert.equal(dateAfter('2026-10-26',90),'2027-01-24');assert.equal(dateAfter('2026-10-26',180),'2027-04-24');assert.equal(dateAfter('2028-02-28',1),'2028-02-29')});
test('all Google flight links explicitly request Chinese and CNY and preserve route/date',()=>{const url=new URL(googleFlightLink({HGH:{name:'杭州'},CJU:{name:'济州'}},'HGH','CJU','2026-11-04'));assert.equal(url.searchParams.get('hl'),'zh-CN');assert.equal(url.searchParams.get('curr'),'CNY');assert.equal(url.searchParams.get('gl'),'CN');assert.match(Buffer.from(url.searchParams.get('tfs'),'base64url').toString(),/2026-11-04.*HGH.*CJU/s)});

test('round-trip search encodes both legs and dates',()=>{const u=new URL(googleFlightLink({},'HGH','OSA','2027-03-10','2027-03-17'));const b=Buffer.from(u.searchParams.get('tfs'),'base64url').toString();assert.match(b,/2027-03-10.*HGH.*OSA.*2027-03-17.*OSA.*HGH/s);assert.equal(u.pathname,'/travel/flights/search');});
