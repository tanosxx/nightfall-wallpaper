import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Data,Motion,Traffic,Lights,Beacons,Atmosphere} from '../extension/nightfall@local/junction-models.js';
import {ASSETS} from '../extension/nightfall@local/junction-native-assets.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser={window:{},console};vm.createContext(browser);
for(const name of ['data','motion','traffic','lights','beacons','atmosphere'])vm.runInContext(fs.readFileSync(path.join(root,`junction-${name}.js`),'utf8'),browser);
const plain=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(Data),plain(browser.window.JUNCTION_DATA));
for(const time of [0,1,2.8,8,15,27,36,53,120,601,3600]){
 assert.deepEqual(plain(Motion.sample(time)),plain(browser.window.JUNCTION_MOTION.sample(time)),`Train/signal/switch parity ${time}`);
 assert.deepEqual(plain(Traffic.sample(time)),plain(browser.window.JUNCTION_TRAFFIC.sample(time)),`Traffic parity ${time}`);
 assert.deepEqual(plain(Beacons.sample(time)),plain(browser.window.JUNCTION_BEACONS.sample(time)),`Beacon parity ${time}`);
 for(let index=0;index<16;index++)assert.deepEqual(plain(Lights.samplePractical(index,time)),plain(browser.window.JUNCTION_LIGHTS.samplePractical(index,time)));
 for(let index=0;index<6;index++)for(let parcel=0;parcel<10;parcel++)assert.deepEqual(plain(Atmosphere.steamAt(index,parcel,time)),plain(browser.window.JUNCTION_ATMOSPHERE.steamAt(index,parcel,time)));
}
assert.equal(ASSETS.windows.length,566);assert.equal(new Set(ASSETS.windows.map(w=>w.facade)).size,37);
assert.equal(ASSETS.fixtures.length,16);assert.equal(ASSETS.plumes.length,7);assert.equal(ASSETS.beacons.length,13);
const atlas=fs.readFileSync(path.join(root,'assets/junction-native/atlas.png'));
assert.deepEqual([...atlas.subarray(0,8)],[137,80,78,71,13,10,26,10]);
const width=atlas.readUInt32BE(16),height=atlas.readUInt32BE(20);
const sprites=[...ASSETS.windows.flatMap(w=>[w.dark,w.bright]),...ASSETS.fixtures,...ASSETS.beacons,...ASSETS.neon.flatMap(n=>[n.emission,n.dim]),...ASSETS.clean,...ASSETS.plumes,...Object.values(ASSETS.stock)];
for(const sprite of sprites){assert(sprite.ax>=0&&sprite.ay>=0);assert(sprite.ax+sprite.w<=width&&sprite.ay+sprite.h<=height);}
console.log(`PASS native Junction model parity and ${sprites.length} atlas bounds (${width}×${height})`);
