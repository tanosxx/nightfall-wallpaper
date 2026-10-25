import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={window:{}};
vm.runInNewContext(await readFile(new URL('../junction-beacons.js',import.meta.url),'utf8'),scope);
const {lamps,power,sample}=scope.window.JUNCTION_BEACONS;
assert(lamps.some(l=>Math.abs(l.x-1149)<1&&Math.abs(l.y-154)<1),'The prominent photographed red beacon is included');
assert(lamps.filter(l=>l.x>344&&l.x<1328).length>=10,'Beacons remain distributed across the cropped desktop view');
for(const l of lamps){
  const high=power(l.period-l.offset,l.period,l.offset);
  const low=power(l.period*1.5-l.offset,l.period,l.offset);
  assert(high>.99&&low<.04,'Existing red lamps must truly dim, not only receive additive glare');
  for(let t=0;t<l.period*2;t+=.01){
    const a=power(t,l.period,l.offset),b=power(t+.01,l.period,l.offset);
    assert(a>=.025&&a<=1);assert(Math.abs(b-a)<.04,'Pulse envelopes are continuous, including period wrap');
  }
}
assert(new Set(sample(1).map(l=>Math.round(l.power*100))).size>4,'The skyline does not pulse in unison');
assert.deepEqual(sample(23),sample(23),'Seeking/pause never changes beacon phases');
console.log('PASS: central-source coverage, genuine dim/bright range, smooth asynchronous beacon pulses.');
