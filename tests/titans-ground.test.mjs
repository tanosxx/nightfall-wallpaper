import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GROUND_ASSET_FILES,FIRE_SOURCES,SMOKE_SOURCES,SALVAGE_SITES,smokeSamples,salvageState,createGroundEffects} from '../extension/nightfall@local/titans-ground.js';

const assets=Object.fromEntries(Object.keys(GROUND_ASSET_FILES).map(key=>[key,{key}]));
const effects=createGroundEffects(assets);
assert.throws(()=>createGroundEffects({}),/Missing titans ground asset/);
for(const name of Object.values(GROUND_ASSET_FILES))assert(fs.statSync(new URL(`../assets/titans/${name}`,import.meta.url)).size>1000);
assert.equal(FIRE_SOURCES.length,31);assert.equal(SMOKE_SOURCES.length,11);assert.equal(SALVAGE_SITES.length,12);
assert.deepEqual(effects.getDiagnostics(12.5,1),effects.getDiagnostics(12.5,1),'pause has identical state');
assert.deepEqual(smokeSamples(30,0),[]);
assert.equal(effects.getDiagnostics(1,0).fireCount,0);
assert.equal(effects.getDiagnostics(NaN,1).time,0);
assert.equal(effects.getDiagnostics(1,99).intensity,1);
assert.equal(effects.getDiagnostics(1,-1).intensity,0);
// Perspective: the main foreground flames are many times taller than the horizon.
const horizon=FIRE_SOURCES.filter(s=>s.depth<.3),near=FIRE_SOURCES.filter(s=>s.depth===1);
assert(Math.max(...horizon.map(s=>s.h))<Math.min(...near.map(s=>s.h)));
// Every puff actually ascends, independently of horizontal wind/turbulence.
const before=smokeSamples(12.1),after=smokeSamples(12.2);
let tracked=0;
for(const p of before){
 const q=after.find(q=>q.source===p.source&&q.born===p.born);
 if(q){assert(q.y<p.y);assert(q.radius>p.radius);tracked++;}
}
assert(tracked>125);
// Protected actor is x70..300,y305..815. Even the plume's full sprite bounds
// stay outside it (small left-edge fire has no smoke source).
for(let t=0;t<100;t+=1.3){
 for(const p of smokeSamples(t)){
  if(p.y+p.radius>305&&p.y-p.radius<815)assert(p.x-p.radius>300);
  assert(p.alpha>=0&&p.alpha<=1);assert(p.radius>0);
 }
}
// Salvage lamps each have both off/working states and irregular welding bursts.
for(let i=0;i<SALVAGE_SITES.length;i++){
 const sequence=Array.from({length:1600},(_,k)=>salvageState(i,k/10));
 assert(sequence.some(s=>s.lamp===0));assert(sequence.some(s=>s.lamp>.6));
 assert(sequence.some(s=>s.weld>.6));assert(sequence.some(s=>s.weld===0));
}
// No renderer frame mutation: recording command streams is exact at a fixed time.
function recordingContext(){
 const calls=[];const gradient={addColorStop(...args){calls.push(['stop',...args]);}};
 const ctx=new Proxy({}, {set(target,key,value){target[key]=value;calls.push(['set',key,value]);return true;},get(target,key){
  if(key in target)return target[key];return(...args)=>{calls.push([key,...args]);if(key==='createRadialGradient')return gradient;};
 }});return{ctx,calls};
}
const a=recordingContext(),b=recordingContext();effects.render(a.ctx,17.75,1);effects.render(b.ctx,17.75,1);
assert.equal(JSON.stringify(a.calls),JSON.stringify(b.calls));
const off=recordingContext();effects.render(off.ctx,17.75,0);assert.equal(off.calls.length,0);
const c=recordingContext();effects.render(c.ctx,17.95,1);assert.notDeepEqual(a.calls,c.calls);
assert(a.calls.some(c=>c[0]==='drawImage'));assert(a.calls.some(c=>c[0]==='stroke'));
console.log(JSON.stringify({passed:true,fireRoots:FIRE_SOURCES.length,smokeSources:SMOKE_SOURCES.length,trackedAscendingPuffs:tracked,salvageSites:SALVAGE_SITES.length,drawCalls:a.calls.filter(c=>c[0]==='drawImage').length}));
