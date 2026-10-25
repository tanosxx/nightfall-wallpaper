import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const scope = {window: {}};
vm.runInNewContext(await readFile(new URL('../junction-motion.js', import.meta.url), 'utf8'), scope);
const {sample, tracks, eventAt, signalFade, switchDuration} = scope.window.JUNCTION_MOTION;
const serial = state => JSON.stringify(state);
assert.equal(sample(0).trains.length, 2);
assert.equal(sample(0).signals.length, 8);
assert.equal(sample(0).switches.length, 2);
assert.equal(sample(4).trains[0].active, true, 'First train arrives within the initial preview');
assert.equal(sample(3.999).trains[0].active, false);
assert.equal(sample(27).trains[1].active, true);
assert.notEqual(tracks[0].direction, tracks[1].direction);
assert.equal(tracks[0].carSpacing, .12, 'Nearby bridge supports full-size carriages');
assert.equal(tracks[1].carSpacing, .09, 'Upper bridge retains its smaller perspective scale');
assert(sample(4).trains[0].span > 1, 'A long nearby consist extends beyond the visible route');

for (const invalid of [-1, NaN, Infinity, undefined])
    assert.equal(serial(sample(invalid)), serial(sample(0)), 'Invalid clocks clamp to the first frame');
for (const time of [0, 4, 26.9, 80, 156, 620, 10000, 1e8]) {
    const before = serial(sample(time));
    sample(time + 100); sample(time / 2); sample(0);
    assert.equal(serial(sample(time)), before, 'Pause, seeking and tab suspension never mutate state');
}

for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    for (let i = 0; i < 24; i++) {
        const event = eventAt(track, i), next = eventAt(track, i + 1);
        assert(event.duration >= 20 && event.duration <= 30);
        assert(event.cars >= 9 && event.cars <= 13, 'Every train is a long consist');
        assert(next.start - event.start >= 55 && next.start - event.start <= 95);
        assert(next.start - event.end > 25, 'Quiet gaps are longer than the busy passage');
        const signal = t => sample(t).signals[trackIndex];
        if (event.start > 10) {
            assert.equal(signal(event.start - 9).aspect, 'amber');
            assert.equal(signal(event.start - 5).levels.green, 1);
        }
        assert.equal(signal(event.start).levels.green, 1, 'A train cannot enter against a red signal');
        const reachesPost = event.start + event.duration * track.signalDistance /
            (1 + event.cars * track.carSpacing);
        assert.equal(signal(reachesPost).levels.green, 1,
            'Green stays lit until the head reaches the visible signal post');
        assert.equal(signal(reachesPost + .14).levels.green, 1,
            'The head clears the post before the signal changes behind it');
        assert.equal(signal(reachesPost + .15 + signalFade + 1e-8).levels.red, 1,
            'The occupied block is protected once the locomotive has passed the signal');
        assert.equal(signal(event.end - .001).levels.red, 1, 'Tail clearance is protected');
        let previousHead = null;
        for (let t = event.start; t < event.end; t += .031) {
            const state = sample(t), train = state.trains[trackIndex], points = state.switches[trackIndex];
            assert(train.active);
            assert(train.progress >= 0 && train.progress < 1);
            assert.equal(points.locked, true);
            assert.equal(points.moving, false, 'Points never move underneath a train');
            assert.equal(points.position, i % 2, 'Route stays aligned for the entire consist');
            if (previousHead !== null)
                assert(Math.abs(train.head - previousHead - .031 * (1 + train.span) / event.duration) < 1e-9,
                    'The visible train moves continuously at a constant cruise speed');
            previousHead = train.head;
        }
        const last = sample(event.end).trains[trackIndex];
        assert.equal(last.active, false);
        assert.equal(last.progress, 1);
        assert(Math.abs(last.head - last.span - 1) < 1e-12, 'The complete tail has left before hiding the consist');
        const epsilon = .001;
        const justBeforeEnd = sample(event.end - epsilon).trains[trackIndex];
        assert(justBeforeEnd.head - justBeforeEnd.span < 1,
            'The last carriage is not clipped away before its trailing edge clears');
        const moving = sample(event.end + 8 + switchDuration / 2).switches[trackIndex];
        assert.equal(moving.moving, true);
        assert.equal(moving.locked, false);
        assert(Math.abs(moving.position - .5) < 1e-9, 'Points ease through a visible intermediate position');
        assert.equal(sample(next.start - 10).switches[trackIndex].moving, false,
            'Points are aligned before the next approach signal clears');
    }
}

let prior = sample(0), switchingServiceSignals = new Set(), phases = new Set();
for (let t = .02; t < 280; t += .02) {
    const state = sample(t);
    state.signals.forEach((signal, i) => {
        const levels = Object.values(signal.levels);
        assert(levels.every(value => value >= 0 && value <= 1));
        assert(Math.abs(levels.reduce((a, b) => a + b, 0) - 1) < 1e-12,
            'Signal fades remain bright without a hard black frame');
        for (const aspect of ['red', 'amber', 'green'])
            assert(Math.abs(signal.levels[aspect] - prior.signals[i].levels[aspect]) < .12,
                'Signal transitions are continuous even at cycle boundaries');
        if (signal.role === 'service' && signal.aspect !== prior.signals[i].aspect)
            switchingServiceSignals.add(signal.id);
    });
    state.switches.forEach((points, i) => {
        assert(Math.abs(points.position - prior.switches[i].position) < .02,
            'No switch-position jumps when a new timetable event becomes current');
    });
    phases.add(state.signals.slice(2).map(signal => signal.aspect).join(','));
    prior = state;
}
assert.equal(switchingServiceSignals.size, 6, 'Every service signal has an active independent cycle');
assert(phases.size > 25, 'Service signals do not pulse in a single synchronized pattern');
console.log('PASS: deterministic independent train timetables, complete-tail clearance, continuous motion, protected entry signals, interlocked points, and six asynchronous signal cycles.');
