import assert from 'node:assert/strict';
import {SUIT_ASSET_FILES,createSuitEffects} from '../extension/nightfall@local/titans-suit.js';
const effect=createSuitEffects();
assert.deepEqual(SUIT_ASSET_FILES,{});
const first=effect.getDiagnostics(0,1);
assert.equal(first.lamps.length,4);
assert.equal(first.traces.length,2);
assert.equal(first.geometryTransforms,0);
assert.deepEqual(effect.getDiagnostics(0,1),first);
assert.notDeepEqual(effect.getDiagnostics(2,1).lamps,first.lamps);
assert.notDeepEqual(effect.getDiagnostics(2,1).traces,first.traces);
assert(effect.getDiagnostics(0,0).lamps.every(l=>l.power===0));
assert(effect.getDiagnostics(0,0).traces.every(l=>l.alpha===0));
const ranges=first.lamps.map(()=>[1,0]);
for(let time=0;time<25;time+=.1){
    const sample=effect.getDiagnostics(time,1);
    sample.lamps.forEach((lamp,i)=>{
        assert(lamp.x>=140&&lamp.x<=250&&lamp.y>=420&&lamp.y<550);
        assert(lamp.radius<=1.7);
        assert(lamp.power>=0&&lamp.power<=1);
        ranges[i][0]=Math.min(ranges[i][0],lamp.power);ranges[i][1]=Math.max(ranges[i][1],lamp.power);
    });
    for(const trace of sample.traces){
        assert(trace.from.every(Number.isFinite)&&trace.to.every(Number.isFinite));
        assert(Math.hypot(trace.to[0]-trace.from[0],trace.to[1]-trace.from[1])<=6.81);
    }
}
assert(ranges.every(([min,max])=>max-min>.5),'Every indicator has a visible independent brightness range');
console.log('Suit source locations, bounded glints, genuine light variation and deterministic animation passed.');
