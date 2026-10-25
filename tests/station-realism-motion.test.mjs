import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Data from '../station-data.js';
import {createStationMotion} from '../station-motion-realism.js';

function inPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[j], [bx, by] = points[i];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
}
const m = createStationMotion(Data, 72819), initial = m.windows.map(w => w.on), changed = new Set();
assert(!('ships' in m)); assert(!('robots' in m));
assert.equal(m.workers.length, 4); assert.equal(m.welders.length, 2); assert.equal(m.workLights.length, 5);
const starts = m.workers.map(w => [w.x, w.y]), moved = new Set(), stopped = new Set(), welded = new Set();
const lampRanges = m.workLights.map(() => [Infinity, -Infinity]);
const activeFrames = m.welders.map(() => 0), onCounts = [], windowsTransitions = [];
let maxSparks = 0, maxSimultaneousWindowChanges = 0, coolingSparks = 0;
const dt = 1 / 24, frames = 7200;
for (let frame = 0; frame < frames; frame++) {
    const prior = m.windows.map(w => w.on), oldPoints = m.workers.map(w => [w.x, w.y]);
    m.update(dt, 1);
    let changes = 0;
    m.windows.forEach((w, i) => {
        assert(w.value >= 0 && w.value <= 1);
        assert(Number.isFinite(w.next) && w.next > m.time);
        if (w.on !== initial[i]) changed.add(i);
        if (w.on !== prior[i]) {
            changes++;
            assert(w.next - m.time >= (w.on ? 15 : 5), 'Room lighting is independently timed, not rapid random flicker');
        }
    });
    windowsTransitions.push(changes); maxSimultaneousWindowChanges = Math.max(maxSimultaneousWindowChanges, changes);
    if (frame % 24 === 0) onCounts.push(m.windows.filter(w => w.on).length);
    m.workers.forEach((worker, i) => {
        assert([worker.x, worker.y, worker.height, worker.phase, worker.stride, worker.progress, worker.angle].every(Number.isFinite));
        assert(worker.progress >= 0 && worker.progress <= 1);
        assert(worker.height >= Data.HANGAR.workers[i].height * .94 && worker.height <= Data.HANGAR.workers[i].height * 1.06);
        assert(Data.HANGAR.floors.some(p => inPolygon(worker.x, worker.y, p)));
        assert(inPolygon(worker.x, worker.y, Data.HANGAR.aperture));
        assert(Math.hypot(worker.x - oldPoints[i][0], worker.y - oldPoints[i][1]) <= Data.HANGAR.workers[i].speed * dt + .03, 'No position jumps on stops or turns');
        if (Math.hypot(worker.x - starts[i][0], worker.y - starts[i][1]) > 2) moved.add(worker.id);
        if (!worker.walking && m.activityTime > 4) stopped.add(worker.id);
    });
    m.welders.forEach((welder, i) => {
        if (welder.active) {welded.add(i); activeFrames[i]++;}
        assert(welder.brightness >= 0 && welder.brightness <= 1);
        maxSparks = Math.max(maxSparks, welder.sparks.length);
        assert(welder.sparks.length <= 12);
        for (const spark of welder.sparks) {
            assert(spark.alpha >= 0 && spark.alpha <= 1 && spark.heat >= 0 && spark.heat <= 1);
            assert(Math.hypot(spark.x - welder.tool[0], spark.y - welder.tool[1]) < 10);
            if (spark.age > spark.life / 2 && spark.alpha < .33) coolingSparks++;
        }
    });
    m.workLights.forEach((lamp, i) => {
        lampRanges[i][0] = Math.min(lampRanges[i][0], lamp.brightness);
        lampRanges[i][1] = Math.max(lampRanges[i][1], lamp.brightness);
        assert(lamp.brightness > .43 && lamp.brightness < .75, 'Practical lamps remain lit during local supply dips');
    });
    Data.BEACONS.forEach((_, i) => assert(m.beaconBrightness(i) >= .025 && m.beaconBrightness(i) <= 1));
    Data.SEQUENCE_LIGHTS.forEach((s, i) => s.points.forEach((_, j) => assert(m.sequenceBrightness(i, j) >= .18 && m.sequenceBrightness(i, j) <= 1)));
}
assert.equal(changed.size, Data.STATION_LIGHTS.length);
assert.equal(moved.size, m.workers.length); assert.equal(stopped.size, m.workers.length); assert.equal(welded.size, m.welders.length);
assert(maxSimultaneousWindowChanges < 12, 'Independent occupancy cycles must not produce mass blackouts');
const transitionCount = windowsTransitions.reduce((a, b) => a + b, 0);
assert(transitionCount < Data.STATION_LIGHTS.length * 17, 'Window cycles must remain readable');
assert(Math.min(...onCounts) > Data.STATION_LIGHTS.length * .62);
assert(lampRanges.every(([min, max]) => max - min < .181));
assert(activeFrames.every(count => count / frames > .03 && count / frames < .19), 'Welding has useful inspection and repositioning pauses');
assert(coolingSparks > 100);

// The live wallpaper must reveal its light animation in a short viewing, not
// require waiting several minutes for barely perceptible changes.
const short = createStationMotion(Data, 99421), earlyChanged = new Set();
const earlyStart = short.windows.map(w => w.on);
const beaconRanges = Data.BEACONS.map(() => [Infinity, -Infinity]);
const sequenceRanges = Data.SEQUENCE_LIGHTS.flatMap((s, i) => s.points.map((_, j) => ({i, j, min: Infinity, max: -Infinity})));
const neonRanges = Array.from({length: 12}, () => [Infinity, -Infinity]);
const practicalRanges = short.workLights.map(() => [Infinity, -Infinity]);
let distinctNeonPatterns = new Set();
for (let frame = 0; frame < 480; frame++) {
    short.update(dt, 1);
    short.windows.forEach((w, i) => {if (w.on !== earlyStart[i]) earlyChanged.add(i);});
    beaconRanges.forEach((range, i) => {const value = short.beaconBrightness(i); range[0] = Math.min(range[0], value); range[1] = Math.max(range[1], value);});
    sequenceRanges.forEach(range => {const value = short.sequenceBrightness(range.i, range.j); range.min = Math.min(range.min, value); range.max = Math.max(range.max, value);});
    neonRanges.forEach((range, i) => {const value = short.neonBrightness(i); assert(value >= 0 && value <= 1); range[0] = Math.min(range[0], value); range[1] = Math.max(range[1], value);});
    practicalRanges.forEach((range, i) => {const value = short.workLights[i].brightness; range[0] = Math.min(range[0], value); range[1] = Math.max(range[1], value);});
    if (frame % 24 === 0) distinctNeonPatterns.add(neonRanges.map((_, i) => short.neonBrightness(i).toFixed(2)).join(','));
}
assert(earlyChanged.size > Data.STATION_LIGHTS.length * .3, 'Windows change visibly across the station in 20 s');
assert(beaconRanges.every(([min, max]) => min < .04 && max > .97), 'Every navigation beacon visibly flashes');
assert(sequenceRanges.every(range => range.min < .2 && range.max > .98), 'Each fixed guide lamp visibly pulses');
assert(neonRanges.every(([min, max]) => max - min > .58), 'All neon strips have visible independent modulation');
assert(practicalRanges.every(([min, max]) => max - min > .06), 'Every practical lamp has an independent visible dip');
assert(distinctNeonPatterns.size > 15);
const pausedLights = JSON.stringify({beacons: beaconRanges.map((_, i) => short.beaconBrightness(i)), neon: neonRanges.map((_, i) => short.neonBrightness(i)), sequence: sequenceRanges.map(range => short.sequenceBrightness(range.i, range.j))});
for (let frame = 0; frame < 48; frame++) short.update(0, 1);
assert.equal(JSON.stringify({beacons: beaconRanges.map((_, i) => short.beaconBrightness(i)), neon: neonRanges.map((_, i) => short.neonBrightness(i)), sequence: sequenceRanges.map(range => short.sequenceBrightness(range.i, range.j))}), pausedLights);

const paused = JSON.stringify(m); m.update(0, 1);
assert.equal(JSON.stringify(m), paused, 'Global pause freezes every state exactly');
m.update(0, 0);
assert(m.welders.every(w => !w.active && w.brightness === 0 && w.sparks.every(s => s.alpha === 0)));
assert(m.workLights.every(w => w.brightness === 0));
const activity = JSON.stringify({workers: m.workers, welders: m.welders, workLights: m.workLights});
const activityTime = m.activityTime, globalTime = m.time;
for (let frame = 0; frame < 480; frame++) m.update(dt, 0);
assert.equal(m.activityTime, activityTime);
assert.equal(JSON.stringify({workers: m.workers, welders: m.welders, workLights: m.workLights}), activity);
assert(m.time > globalTime + 19);
m.update(dt, 1); assert(m.activityTime > activityTime); assert(m.workLights.some(w => w.brightness > 0));

const context = {window: {}};
vm.runInNewContext(await readFile(new URL('../station-motion-realism-browser.js', import.meta.url), 'utf8'), context);
const browser = context.window.STATION_MOTION.createStationMotion(Data, 40219), module = createStationMotion(Data, 40219);
for (let frame = 0; frame < 1000; frame++) {
    browser.update(dt, .7); module.update(dt, .7);
    module.neonBrightness(frame % 23); // Getter calls must not perturb random timers.
}
assert.equal(JSON.stringify(browser), JSON.stringify(module), 'Classic browser wrapper and module remain identical');
for (let i = 0; i < 25; i++) assert.equal(browser.neonBrightness(i), module.neonBrightness(i));
console.log(JSON.stringify({seconds: 300, windowsChanged: changed.size, windowTransitions: transitionCount,
    maxSimultaneousWindowChanges, minLit: Math.min(...onCounts), maxLit: Math.max(...onCounts),
    lampRanges, weldingDuty: activeFrames.map(count => count / frames), maxSparks,
    windowsChangedIn20s: earlyChanged.size, beaconRanges, neonRanges, practicalRanges,
    workersMoved: [...moved], workersStopped: [...stopped]}));
console.log('PASS: visible independent windows, beacons, fixed guide lamps, neon and practical lights in 20 s; bounded motion for 300 s; pause/break and browser parity.');
