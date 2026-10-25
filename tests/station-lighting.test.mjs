import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createStationLighting,STATION_MODES} from '../station-lighting.js';
const light=createStationLighting();
const shift=JSON.stringify(light.state);
assert.equal(light.setMode('invalid'),false);assert.equal(JSON.stringify(light.state),shift);
assert(light.setMode('night'));assert.equal(light.state.ambient,.92);
light.update(0);assert.equal(light.time,0);assert.equal(light.state.ambient,.92);
const states=[];for(let f=0;f<120;f++){light.update(1/24);states.push(light.state.ambient);assert(Math.abs(Math.hypot(...light.state.direction)-1)<1e-9);assert(light.state.transition>=0&&light.state.transition<=1);}
for(let i=1;i<96;i++)assert(states[i]<=states[i-1]+1e-9);
assert.equal(light.mode,'night');assert.equal(light.state.ambient,.43);
const paused=JSON.stringify(light);light.update(0);assert.equal(JSON.stringify(light),paused);
light.setMode('service',true);assert.equal(light.mode,'service');assert.equal(light.state.transition,1);assert(light.state.scanGain>0&&light.state.weldGain>1);
const scan=light.state.scanPosition;light.update(1/24);assert(light.state.scanPosition>scan);
light.setMode('night');light.update(.1);const mid=light.state.ambient;light.setMode('shift');assert.equal(light.state.ambient,mid);for(let i=0;i<41;i++)light.update(.1);assert.equal(light.mode,'shift');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../station-lighting-browser.js',import.meta.url),'utf8'),ctx);
const a=createStationLighting(),b=ctx.window.STATION_LIGHTING.createStationLighting();for(let f=0;f<360;f++){if(f%120===0){const mode=STATION_MODES[f/120];a.setMode(mode);b.setMode(mode);}a.update(1/24);b.update(1/24);}assert.equal(JSON.stringify(a),JSON.stringify(b));
console.log('PASS: 4s continuous mode transition, mid-transition retarget, normalized direction, immediate paused selection, exact global pause, moving inspection strip, browser/native shared parity.');
