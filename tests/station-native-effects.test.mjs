import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {Model as Industrial} from '../extension/nightfall@local/station-industrial-native.js';
import {Model as Space} from '../extension/nightfall@local/station-space-model.js';
const context={window:{}};
for(const name of ['industrial','space'])vm.runInNewContext(fs.readFileSync(new URL(`../station-${name}.js`,import.meta.url),'utf8'),context);
const plain=v=>JSON.parse(JSON.stringify(v));
for(const t of [0,.15,3,8,17,38,95,741]){
 assert.deepEqual(plain(context.window.STATION_INDUSTRIAL.steamSamples(t,1)),Industrial.steamSamples(t,1));
 assert.equal(context.window.STATION_INDUSTRIAL.carriagePosition(t),Industrial.carriagePosition(t));
 assert.deepEqual(plain(context.window.STATION_SPACE.sample(t)),Space.sample(t));
}
for(const name of ['station-motion-realism.js','station-realism-lighting.js']){
 assert.equal(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),fs.readFileSync(new URL('../extension/nightfall@local/'+name,import.meta.url),'utf8'));
}
assert.deepEqual(Industrial.steamSamples(2,0),[]);
console.log('Station native approved motion, lighting, steam, carriage and sky model parity PASS');
