/* Shared deterministic scene behaviour. Geometry for people/stars/beacons/water
 * uses source-image pixels; window masks retain the original data coordinates. */
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => x * x * (3 - 2 * x);
const fraction = x => x - Math.floor(x);

function randomGenerator(seed) {
    let state = seed === undefined ? (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 : seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function routeFor(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++)
        lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return {points, lengths, length: lengths.at(-1) ?? 0};
}

function placePerson(state, route, distance) {
    if (!route.points.length) return;
    for (let i = 1; i < route.points.length; i++) {
        if (distance <= route.lengths[i]) {
            const a = route.points[i - 1], b = route.points[i];
            const mix = clamp((distance - route.lengths[i - 1]) / Math.max(.0001, route.lengths[i] - route.lengths[i - 1]), 0, 1);
            state.x = a[0] + (b[0] - a[0]) * mix;
            state.y = a[1] + (b[1] - a[1]) * mix;
            if (state.walking && Math.abs(b[0] - a[0]) > .001)
                state.face = Math.sign(b[0] - a[0]) * state.direction;
            return;
        }
    }
    [state.x, state.y] = route.points.at(-1);
}

export function createPolarMotion(data, seed) {
    const random = randomGenerator(seed);
    const between = (a, b) => a + random() * (b - a);
    const routes = (data.PEOPLE ?? []).map(person => routeFor(person.points ?? []));
    const motion = {
        time: 0,
        windows: (data.WINDOWS ?? []).map(() => {
            const on = random() < .88;
            return {on, value: on ? 1 : 0, from: on ? 1 : 0, start: 0, fade: .2, next: between(1, 8)};
        }),
        people: (data.PEOPLE ?? []).map((person, index) => {
            const route = routes[index];
            const distance = fraction(person.phase ?? random()) * route.length;
            const direction = index % 2 === 0 ? 1 : -1;
            let target = direction > 0 ? route.lengths.findIndex(d => d > distance) : route.lengths.findLastIndex(d => d < distance);
            if (target < 0) target = direction > 0 ? Math.max(0, route.points.length - 1) : 0;
            const state = {
                x: route.points[0]?.[0] ?? 0, y: route.points[0]?.[1] ?? 0,
                height: person.height ?? 12, color: person.color ?? [39, 50, 61],
                walking: route.length > .1, working: route.length <= .1,
                stride: random() * TAU, face: direction, action: route.length > .1 ? 'walk' : 'work',
                direction, distance, target, wait: route.length > .1 ? 0 : between(5, 12),
                speed: Math.max(.1, person.speed ?? 3), routeIndex: index,
            };
            placePerson(state, route, distance);
            return state;
        }),
    };

    motion.starBrightness = index => {
        const star = (data.STARS ?? [])[index] ?? {};
        const phase = star.phase ?? index * 2.31;
        const t = motion.time * TAU / Math.max(.7, star.period ?? 3.2);
        const strength = clamp(star.strength ?? .09, 0, .18);
        return 1 + strength * (.52 * Math.sin(t + phase) + .29 * Math.sin(t * 2.31 + phase * 1.7) + .19 * Math.sin(t * .71 + phase * .4));
    };
    motion.beaconBrightness = index => {
        const beacon = (data.BEACONS ?? [])[index] ?? {};
        const phase = motion.time * TAU / Math.max(.8, beacon.period ?? 3) + (beacon.phase ?? index * 1.9);
        return .035 + .965 * Math.pow(Math.max(0, Math.sin(phase)), 8);
    };
    motion.waterDisplacement = (x, y, index = 0) => {
        const region = (data.WATER_SURFACE ?? [])[index] ?? {};
        const depth = clamp((y - 440) / 460, 0, 1);
        const amplitude = region.amplitude ?? 1;
        const t = motion.time + (region.phase ?? 0);
        return [
            (Math.sin(y * .16 + t * 1.25) + .4 * Math.sin(y * .073 - t * .83 + x * .007)) * (.3 + depth * 1.5) * amplitude,
            (Math.sin(x * .025 + t * .71) + .4 * Math.sin(y * .09 + t * .52)) * (.12 + depth * .45) * amplitude,
        ];
    };
    motion.update = dt => {
        dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        if (!dt) return motion;
        motion.time += dt;
        for (const state of motion.windows) {
            if (motion.time >= state.next) {
                state.on = !state.on;
                state.from = state.value;
                state.start = motion.time;
                state.fade = between(.12, .42);
                state.next = motion.time + state.fade + (state.on ? between(7, 28) : between(2.5, 10));
            }
            const f = smooth(clamp((motion.time - state.start) / state.fade, 0, 1));
            state.value = state.from + ((state.on ? 1 : 0) - state.from) * f;
        }
        motion.people.forEach((person, index) => {
            const source = data.PEOPLE[index], route = routes[index];
            if (!route.points.length) return;
            if (person.wait > 0) {
                person.wait -= dt;
                if (person.wait > 0) return;
                if (route.length <= .1) {
                    person.working = !person.working;
                    person.action = person.working ? 'work' : 'inspect';
                    person.wait = between(4, 11);
                    return;
                }
                if (person.target === 0) person.direction = 1;
                if (person.target === route.points.length - 1) person.direction = -1;
                person.target += person.direction;
                person.walking = true; person.working = false; person.action = 'walk';
            }
            const destination = route.lengths[person.target];
            person.distance += person.speed * person.direction * dt;
            person.stride += person.speed / Math.max(2, person.height * .4) * TAU * dt;
            if ((person.direction > 0 && person.distance >= destination) || (person.direction < 0 && person.distance <= destination)) {
                person.distance = destination;
                person.walking = false;
                person.working = (source.workStops ?? []).includes(person.target);
                person.action = person.working ? 'work' : random() < .55 ? 'inspect' : 'stand';
                person.wait = person.working ? between(5, 13) : between(2, 6);
            }
            placePerson(person, route, person.distance);
        });
        return motion;
    };
    return motion;
}
