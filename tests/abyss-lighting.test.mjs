import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const realm = {window: {}};
vm.runInNewContext(fs.readFileSync(new URL('../abyss-lighting.js', import.meta.url), 'utf8'), realm);
const {sample, windows, worklamps, beacons, windowSchedules, lampEvent} = realm.window.ABYSS_LIGHTING;
const encoded = t => JSON.stringify(sample(t));
assert.equal(encoded(12.34), encoded(12.34), 'the paused image must be deterministic');
const before = encoded(500.3);
sample(0); sample(1e6); sample(4);
assert.equal(encoded(500.3), before, 'scrubbing and long sessions must not change the seeded schedule');
assert.equal(encoded(Number.NaN), encoded(0));
assert.equal(encoded(-1), encoded(0));

const overlaps = (points, [x0,y0,x1,y1]) => {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return Math.max(...xs) > x0 && Math.min(...xs) < x1 && Math.max(...ys) > y0 && Math.min(...ys) < y1;
};
assert(windows.length >= 30, 'small-room animation must cover the whole group of towers');
assert.equal(windowSchedules.length, windows.length, 'every room must have an independent schedule');
assert.equal(new Set(windows.map(fixture => fixture.id)).size, windows.length, 'room fixtures must have unique identities');
for (const fixture of windows) {
    assert(!overlaps(fixture.points, [838,250,1266,339]), `${fixture.id} must not dim the main observatory`);
    assert(!overlaps(fixture.points, [628,466,644,794]), `${fixture.id} must leave the lift shaft alone`);
}

const minima = windows.map(() => 1), maxima = windows.map(() => 0);
let independentStates = 0;
for (let t = 0; t < 300; t += .1) {
    const state = sample(t);
    assert.equal(state.windows.length, windows.length);
    assert.equal(state.worklamps.length, worklamps.length);
    assert.equal(state.beacons.length, beacons.length);
    state.windows.forEach((dim, i) => {
        assert(dim >= 0 && dim <= 1);
        minima[i] = Math.min(minima[i], dim);
        maxima[i] = Math.max(maxima[i], dim);
    });
    if (state.windows.some(v => v > .9) && state.windows.some(v => v === 0)) independentStates++;
    assert(state.beacons.every(v => v >= .035 - 1e-10 && v <= 1));
    assert(state.worklamps.every(v => v >= 0 && v <= .94));
}
assert(minima.every(v => v === 0), 'every room must return to its original on state');
assert(maxima.every(v => v > .9), 'every small room must have a clearly dark state');
assert(independentStates > 1000, 'different rooms must turn on/off independently');
assert.equal(beacons.length, 5);

const epsilon = 1e-6;
const largestDifference = (a,b) => Math.max(...a.map((v,i) => Math.abs(v-b[i])));
for (let i = 0; i < windows.length; i++) {
    const schedule = windowSchedules[i];
    for (let cycle = 1; cycle < 12; cycle++) {
        const boundary = cycle * schedule.period - schedule.offset;
        if (boundary <= epsilon) continue;
        assert(largestDifference(sample(boundary-epsilon).windows, sample(boundary+epsilon).windows) < .00002,
            'window cycle boundaries must not jump');
    }
}

let testedBursts = 0;
for (let i = 0; i < worklamps.length; i++) {
    for (let cycle = 0; cycle < 12; cycle++) {
        const event = lampEvent(i, cycle);
        assert(event.duration >= 2 && event.duration <= 4);
        if (cycle > 0) {
            const quietGap = event.start - lampEvent(i, cycle-1).end;
            assert(quietGap >= 15 && quietGap <= 45, `quiet gap ${quietGap} must remain varied and occasional`);
        }
        assert.equal(sample(event.start).worklamps[i], 0);
        assert.equal(sample(event.end).worklamps[i], 0);
        let dips = 0, recoveries = 0, dark = false, peak = 0;
        for (let k = 0; k <= 500; k++) {
            const amount = sample(event.start + event.duration * k / 500).worklamps[i];
            peak = Math.max(peak, amount);
            if (!dark && amount > .7) { dark = true; dips++; }
            if (dark && amount < .02) { dark = false; recoveries++; }
        }
        assert.equal(dips, 3, 'each contact fault needs several dips, not one gentle dim');
        assert.equal(recoveries, 3, 'the lamp circuit must recover between dips and after the burst');
        assert(peak >= .79 && peak <= .94);
        for (const [phase] of event.knots) {
            const boundary = event.start + phase * event.duration;
            const jump = Math.abs(sample(boundary-epsilon).worklamps[i] - sample(boundary+epsilon).worklamps[i]);
            assert(jump < .00002, 'switching edges must be smooth at exact schedule boundaries');
        }
        testedBursts++;
    }
}
assert(lampEvent(1, 0).start >= 4 && lampEvent(1, 0).start <= 6,
    'a visible central lamp should start its first fault within four to six seconds');
assert.notEqual(JSON.stringify(lampEvent(1,0).knots), JSON.stringify(lampEvent(1,1).knots),
    'successive bursts should have different timing and amplitude');

console.log(JSON.stringify({status:'PASS',windows:windows.length,beacons:beacons.length,
    whiteLampCircuits:worklamps.length,testedBursts,firstFault:lampEvent(1,0).start,
    pauseDeterministic:true,independentRooms:true,continuousBoundaries:true}));
