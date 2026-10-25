import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Data from '../station-data.js';
import {createStationMotion} from '../station-motion-realism.js';
import {createStationLighting} from '../station-realism-lighting.js';

// Execute the production scheduler with real simulation clocks. Only drawing
// and RAF delivery are replaced, so the test catches changes to tick()/sync().
const source = await readFile(new URL('../station-realism-scene.js', import.meta.url), 'utf8');
const tickStart = source.indexOf('  function tick(now){');
const syncStart = source.indexOf('  function sync(){', tickStart);
const syncEnd = source.indexOf('  function fit(){', syncStart);
assert(tickStart >= 0 && syncStart > tickStart && syncEnd > syncStart, 'Locate production tick and sync');
const schedulerSource = source.slice(tickStart, syncEnd);
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);

function scheduler() {
    const motion = createStationMotion({...Data, HANGAR: {...Data.HANGAR, workers: []}}, 81402);
    const lighting = createStationLighting();
    const motionSteps = [], lightingSteps = [], pending = new Map();
    const motionUpdate = motion.update, lightingUpdate = lighting.update;
    motion.update = (dt, intensity) => {motionSteps.push(dt); return motionUpdate(dt, intensity);};
    lighting.update = dt => {lightingSteps.push(dt); return lightingUpdate(dt);};
    let nextId = 1, draws = 0;
    const context = {
        motion, lighting, last: 0, lastPaint: 0, frame: undefined, paused: false, intensity: 1,
        document: {hidden: false},
        draw() {draws++;},
        requestAnimationFrame(callback) {const id = nextId++; pending.set(id, callback); return id;},
        cancelAnimationFrame(id) {pending.delete(id);},
    };
    vm.runInNewContext(schedulerSource, context);
    function deliver(now) {
        assert.equal(pending.size, 1, 'Exactly one RAF remains scheduled');
        const [id, callback] = pending.entries().next().value;
        pending.delete(id); callback(now);
    }
    context.sync();
    return {context, motion, lighting, motionSteps, lightingSteps, pending, deliver, draws: () => draws};
}

const slow = scheduler(), fast = scheduler();
slow.lighting.setMode('night'); fast.lighting.setMode('night');
slow.deliver(1000); fast.deliver(1000);
slow.deliver(2000);
for (let frame = 1; frame <= 60; frame++) fast.deliver(1000 + frame * 1000 / 60);
for (const run of [slow, fast]) {
    close(run.motion.time, 1, 'One wall-clock second advances motion by one second');
    close(run.motion.activityTime, 1, 'Hangar activity uses the same elapsed time');
    close(run.lighting.time, 1, 'Lighting follows elapsed time');
    close(run.lighting.state.transition, .2, 'A five-second mode transition is frame-rate independent');
}
assert.equal(slow.motionSteps.length, 10, 'A 1 Hz RAF interval is split into ten stable steps');
assert.equal(fast.motionSteps.length, 60);
for (let second = 3; second <= 6; second++) slow.deliver(second * 1000);
close(slow.motion.time, 5, 'Five slow RAF intervals retain five seconds');
assert.equal(slow.lighting.mode, 'night', 'Mode transitions finish even in throttled previews');

// A normal pause discards the old RAF timestamp. Resuming after several
// minutes establishes a fresh baseline instead of catching up the pause.
const pausedState = JSON.stringify({motion: slow.motion, lighting: slow.lighting});
slow.context.paused = true; slow.context.sync();
assert.equal(slow.pending.size, 0); assert.equal(slow.context.last, 0);
slow.context.paused = false; slow.context.sync(); slow.deliver(186000);
assert.equal(JSON.stringify({motion: slow.motion, lighting: slow.lighting}), pausedState);
slow.deliver(187000); close(slow.motion.time, 6, 'Only time after resume advances');

// Browser visibility uses the same reset path, including a long hidden period.
const beforeHidden = slow.motion.time, beforeHiddenLighting = slow.lighting.time;
slow.context.document.hidden = true; slow.context.sync();
assert.equal(slow.pending.size, 0); assert.equal(slow.context.last, 0);
slow.context.document.hidden = false; slow.context.sync(); slow.deliver(487000);
close(slow.motion.time, beforeHidden, 'Hidden minutes are not replayed');
close(slow.lighting.time, beforeHiddenLighting, 'Hidden lighting time is not replayed');
slow.deliver(487000 + 1000 / 60);
close(slow.motion.time, beforeHidden + 1 / 60, 'Visible animation resumes at the next frame');

// A blocked foreground event loop may catch up only two seconds. No step
// exceeds the simulation's 100 ms limit, and no backlog survives the stall.
const beforeStall = slow.motion.time, beforeSteps = slow.motionSteps.length;
slow.deliver(497000 + 1000 / 60);
close(slow.motion.time - beforeStall, 2, 'A ten-second stall is capped at two seconds');
assert.equal(slow.motionSteps.length - beforeSteps, 20);
const afterStall = slow.motion.time;
slow.deliver(497000 + 2000 / 60);
close(slow.motion.time - afterStall, 1 / 60, 'Discarded stall time is not replayed later');
for (const run of [slow, fast]) {
    assert(run.motionSteps.every(dt => Number.isFinite(dt) && dt > 0 && dt <= .1));
    assert.deepEqual(run.motionSteps, run.lightingSteps, 'Motion and lighting receive identical bounded steps');
    assert.equal(run.pending.size, 1);
}
console.log(JSON.stringify({raf1HzSeconds: 1, raf60HzSeconds: fast.motion.time,
    maximumStep: Math.max(...slow.motionSteps, ...fast.motionSteps), stallAdvanceSeconds: 2,
    pauseCatchUp: 0, hiddenCatchUp: 0, slowRafDraws: slow.draws()}));
console.log('PASS: production frame clock advances at 1 Hz and 60 Hz, resets after pause/hide, and bounds stalls and simulation steps.');
