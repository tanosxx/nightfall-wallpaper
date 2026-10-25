import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../station-industrial.js',import.meta.url),'utf8'),context);
const {vents,strips,steamSamples,carriagePosition}=context.window.STATION_INDUSTRIAL;
let maximum=0,active=new Set(),travel=0,prior=carriagePosition(0);
for(let frame=0;frame<60*30;frame++){
 const t=frame/30,samples=steamSamples(t,1);maximum=Math.max(maximum,samples.length);
 for(const s of samples){
  const vent=vents[s.vent];active.add(s.vent);
  assert([s.x,s.y,s.radius,s.angle,s.alpha].every(Number.isFinite));
  assert(s.alpha>=0&&s.alpha<=.25&&s.radius>0&&s.radius<20);
  assert(Math.hypot(s.x-vent.x,s.y-vent.y)<45,'Steam stays local to its physical outlet');
  assert(Number.isInteger(s.texture)&&s.texture>=0&&s.texture<8);
 }
 const pos=carriagePosition(t);assert(pos>=0&&pos<=1);assert(Math.abs(pos-prior)<.006,'No carriage jumps');
 travel+=Math.abs(pos-prior);prior=pos;
}
assert.equal(active.size,4);assert(maximum>20&&maximum<120);assert(travel>3);
assert.equal(steamSamples(12,0).length,0);
assert.equal(JSON.stringify(steamSamples(12.46)),JSON.stringify(steamSamples(12.46)),'Paused frame repeats exactly');
assert.notEqual(JSON.stringify(steamSamples(1)),JSON.stringify(steamSamples(1.2)),'Steam moves between frames');
assert.equal(strips.length,7);
const scene=fs.readFileSync(new URL('../station-realism-scene.js',import.meta.url),'utf8');
assert(!/function worker\(|worker\(a,/.test(scene),'No character painter remains');
assert(scene.includes('workers:[]'),'No walking character simulation is created');
assert(scene.includes('industrial.machinery(')&&scene.includes('industrial.rotor(')&&scene.includes('industrial.steam('));
console.log(`PASS: four local steam sources, max ${maximum} puffs, continuous carriage with dwell/reverse, repeatable pause, seven neon strips, no animated people.`);
