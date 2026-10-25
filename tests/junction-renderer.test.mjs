import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const scope = {window: {}, URL, document: {currentScript: {
    src: 'http://127.0.0.1:8847/junction-renderer.js',
}}};
vm.createContext(scope);
for (const filename of ['junction-data.js', 'junction-motion.js', 'junction-renderer.js'])
    vm.runInContext(await readFile(new URL(`../${filename}`, import.meta.url), 'utf8'), scope);
const {JUNCTION_DATA: data, JUNCTION_MOTION: motion, JUNCTION_RENDER: render} = scope.window;

// This probe describes a carriage at a desired rail coordinate; it does not
// prescribe the renderer's perspective projection or sprite transformation.
function probe(track, u) {
    return render.carGeometry({id: track.id, direction: 1, cars: 1,
        span: track.carSpacing, head: u + track.carSpacing / 2}, 0);
}

function checkContact(point, route) {
    const u = (point.x - route.start[0]) / (route.end[0] - route.start[0]);
    if (u < 0 || u > 1) return;
    // Independently sample the measured photographic rail at this x. The
    // carriage's wheel plane belongs on its near rail, not the centreline.
    const rail = data.routeAt(route, u);
    assert(Math.abs(point.y - rail.y - rail.halfGauge) < 1e-7,
        `${route.id}: wheels stay on the visible near rail`);
}

let visibleCarriages = 0, contacts = 0;
for (const track of motion.tracks) {
    const route = data.routes.find(route => route.id === track.id);
    const event = motion.eventAt(track, 0);
    const post = data.signals.find(signal => signal.id === `${track.id}-entry`);
    // Find the actual frame where the nose passes the measured post. This
    // checks the timetable against geometry without sharing its formula.
    let beforePost = event.start, afterPost = event.end;
    for (let i = 0; i < 40; i++) {
        const time = (beforePost + afterPost) / 2;
        const train = motion.sample(time).trains.find(train => train.id === track.id);
        const u = train.direction === 1 ? train.head : 1 - train.head;
        const nose = render.routePoint(track.id, u);
        if ((nose.x - post.x) * track.direction < 0) beforePost = time;
        else afterPost = time;
    }
    assert.equal(motion.sample(afterPost).signals.find(signal => signal.id === post.id).levels.green, 1,
        'The photographed post stays green while the locomotive passes it');
    assert.equal(motion.sample(afterPost + .8).signals.find(signal => signal.id === post.id).levels.red, 1,
        'The photographed post turns red behind the locomotive');
    let previous = null;
    for (let time = event.start; time < event.end; time += 1 / 120) {
        const train = motion.sample(time).trains.find(train => train.id === track.id);
        const cars = Array.from({length: train.cars}, (_, index) => render.carGeometry(train, index));
        cars.forEach((car, index) => {
            assert([car.a.x, car.a.y, car.b.x, car.b.y, car.p.x, car.p.y,
                car.height, car.width, car.slope].every(Number.isFinite),
            'Geometry remains finite, including carriages waiting outside the frame');
            assert(car.width > 0 && car.height > 0, 'Carriages do not invert or flatten');
            assert(car.a.x < car.p.x && car.p.x < car.b.x);
            if (car.visible) {
                visibleCarriages++;
                for (const point of [car.a, car.p, car.b]) {
                    checkContact(point, route); contacts++;
                }
                assert(car.height > 15 && car.height < 100,
                    'Rolling stock retains a plausible building-relative scale');
            }
            const before = previous?.[index];
            if (before && (before.visible || car.visible)) {
                for (const key of ['a', 'p', 'b'])
                    assert(Math.hypot(car[key].x - before[key].x, car[key].y - before[key].y) < 3,
                        'Motion is smooth across rail segments and image boundaries');
                assert(Math.abs(car.height - before.height) < .15,
                    'Perspective changes gradually instead of popping between scales');
                assert(Math.abs(car.slope - before.slope) < .002,
                    'Carriage angle does not snap at measured route knots');
                assert(Math.sign(car.p.x - before.p.x) === train.direction,
                    'Each consist travels in its scheduled direction');
            }
        });
        previous = cars;
    }

    let previousSize = 0;
    for (const u of [.07, .2, .4, .6, .8, .93]) {
        const car = probe(track, u);
        assert(car.width > previousSize, 'Carriage scale grows toward the right foreground');
        previousSize = car.width;
        checkContact(car.p, route);
    }

    // Partial visibility must clip a full carriage. Clamping its endpoints
    // would squash its body to a sliver as it enters or leaves the image.
    const entering = probe(track, -.01), enteringInside = probe(track, .07);
    assert(entering.visible && entering.a.x < route.start[0] && entering.b.x > route.start[0]);
    assert(entering.width > enteringInside.width * .85,
        'An entering carriage keeps its width across the left clipping edge');
    const leaving = probe(track, 1.01), leavingInside = probe(track, .93);
    assert(leaving.visible && leaving.a.x < route.end[0] && leaving.b.x > route.end[0]);
    assert(leaving.width > leavingInside.width * .95,
        'A leaving carriage keeps its width across the right clipping edge');
    assert.equal(probe(track, -.2).visible, false);
    assert.equal(probe(track, 1.2).visible, false);

    const start = motion.sample(event.start).trains.find(train => train.id === track.id);
    const end = motion.sample(event.end).trains.find(train => train.id === track.id);
    assert.equal(render.carGeometry(start, 0).visible, false,
        'The locomotive starts outside the picture, without appearing halfway through a carriage');
    assert.equal(render.carGeometry(end, end.cars - 1).visible, false,
        'The last full carriage has cleared the picture before the train is hidden');
}
assert(visibleCarriages > 25000 && contacts > 75000, 'Both complete passages were exercised');

// Explicit smoke samples also cover the reversed sprite/cab orientation.
for (const [time, id, direction] of [[16, 'lower', 1], [39, 'upper', -1]]) {
    const train = motion.sample(time).trains.find(train => train.id === id);
    assert(train.active);
    assert.equal(train.direction, direction);
    const cars = Array.from({length: train.cars}, (_, index) => render.carGeometry(train, index));
    assert(cars.some(car => car.visible), `${id}: at least one carriage is on screen`);
    assert.equal(cars[0].direction, direction);
    assert.equal(cars.at(-1).direction, -direction, 'The rear driving cab faces the rear');
    assert(cars[0].cab && cars.at(-1).cab);
}
console.log('PASS: finite rolling-stock geometry, near-rail wheel contact, increasing perspective scale, full-width edge clipping, smooth two-direction travel, and complete consist entry/clearance.');
