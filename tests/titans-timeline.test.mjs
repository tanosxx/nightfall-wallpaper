import assert from 'node:assert/strict';
import {createTitansTimeline} from '../extension/nightfall@local/titans-timeline.js';

const clock = createTitansTimeline();
assert.equal(clock.time, 0);
for (let frame = 0; frame < 144; frame++) clock.update(1 / 24, .65);
assert.ok(Math.abs(clock.time - 6) < 1e-12);
const paused = clock.time;
for (const dt of [0, -1, NaN, Infinity, undefined]) clock.update(dt, .65);
assert.equal(clock.time, paused, 'Pause and invalid deltas must never advance animation');
clock.update(0, -1); assert.equal(clock.intensity, 0);
clock.update(0, 2); assert.equal(clock.intensity, 1);
clock.update(0, NaN); assert.equal(clock.intensity, 1);
clock.update(20, .4);
assert.ok(Math.abs(clock.time - paused - .1) < 1e-12, 'A stalled frame cannot jump the scene forward');
assert.equal(clock.intensity, .4);
console.log('Titans shared clock: pause, invalid input, control bounds and stall clamp PASS');
