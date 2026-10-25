/* Classic browser wrapper of station-motion-realism.js. */
(function () {
/* Photographic station timing. Source-image coordinates and the original
 * four walking workers / two welders are retained. No camera or star motion. */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fraction = v => v - Math.floor(v);
const smooth = v => v * v * (3 - 2 * v);
function generator(seed) {
    let value = seed === undefined ? (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 : seed >>> 0;
    return () => {value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296;};
}
function makePath(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return {points, lengths, length: lengths.at(-1) ?? 0};
}
function along(path, progress) {
    const distance = clamp(progress, 0, 1) * path.length;
    for (let i = 1; i < path.points.length; i++) if (distance <= path.lengths[i]) {
        const a = path.points[i - 1], b = path.points[i], u = clamp((distance - path.lengths[i - 1]) / Math.max(.001, path.lengths[i] - path.lengths[i - 1]), 0, 1);
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    return path.points.at(-1) ?? [0, 0];
}

function createStationMotion(data, seed) {
    const random = generator(seed), between = (a, b) => a + random() * (b - a);
    const range = (v, fallback) => Array.isArray(v) ? between(v[0], v[1]) : Number.isFinite(v) ? v : fallback;
    const hangar = data.HANGAR ?? {};
    const motion = {
        time: 0, activityTime: 0, intensity: 1,
        windows: (data.STATION_LIGHTS ?? []).map(() => {
            const on = random() < .83;
            // Start partway through each independent occupancy cycle. The whole
            // station must not begin its working day on the first rendered frame.
            return {on, value: on ? 1 : 0, from: on ? 1 : 0, start: 0, fade: .4,
                next: on ? between(.4, 53) : between(.4, 17)};
        }),
        workers: [], welders: [], workLights: [],
    };
    const travellers = [];
    function traveller(source, index) {
        const path = makePath(source.path ?? []), direction = random() < .5 ? -1 : 1;
        const state = {id: source.id ?? `worker-${index}`, x: 0, y: 0,
            height: source.height ?? 8, color: source.color ?? [148, 114, 63],
            heading: direction, angle: 0, walking: false, working: false,
            phase: between(0, TAU), stride: 0, progress: between(.08, .92),
            armPhase: between(0, TAU)};
        const runtime = {source, state, path, direction, speed: Math.max(.1, source.speed ?? 2),
            movingSpeed: 0, height: state.height,
            middleY: path.points.length ? path.points.reduce((sum, point) => sum + point[1], 0) / path.points.length : 0,
            stopUntil: index % 3 === 1 ? between(1, 4.5) : 0,
            nextStop: between(13, 29),
            loop: path.points.length > 2 && Math.hypot(path.points[0][0] - path.points.at(-1)[0], path.points[0][1] - path.points.at(-1)[1]) < 1};
        [state.x, state.y] = along(path, state.progress);
        travellers.push(runtime); return state;
    }
    motion.workers = (hangar.workers ?? []).map(traveller);
    const welding = (hangar.welders ?? []).map((source, index) => {
        const state = {id: source.id ?? `welder-${index}`, x: source.x, y: source.y,
            height: source.height ?? 10, tool: [...(source.tool ?? [source.x + 3, source.y - 4])],
            color: source.color ?? [122, 125, 119], active: false, brightness: 0, sparks: [], phase: between(0, TAU)};
        motion.welders.push(state);
        return {state, next: between(.6, 3.5), start: 0, end: 0, nextSpark: 0,
            remaining: 0, power: .8, noiseFrom: .8, noiseTo: .8, noiseStart: 0, noiseEnd: 0};
    });
    const lamps = (hangar.workLights ?? []).map((source, index) => {
        const state = {brightness: 0};
        motion.workLights.push(state);
        return {state, base: between(.62, .73),
            nextDip: between(3, 15), start: -1, end: -1, dip: 0};
    });
    const beacons = (data.BEACONS ?? []).map((beacon, index) => ({
        period: clamp((beacon.period ?? 3.5) * between(.93, 1.06), 2.1, 5),
        phase: (beacon.phase ?? index * 2.1) + between(-.3, .3),
    }));
    // A separate index-derived seed keeps the simulation unchanged if the
    // renderer requests a different number of neon strips or draw calls.
    const neonSeed = Math.floor(random() * 4294967296), neonProfiles = new Map();
    function neonProfile(index) {
        index = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
        if (!neonProfiles.has(index)) {
            const rng = generator((neonSeed ^ Math.imul(index + 1, 2654435761)) >>> 0);
            neonProfiles.set(index, {period: 4.5 + rng() * 6, phase: rng() * TAU,
                dipPeriod: 16 + rng() * 17, dipOffset: rng(), dipDuration: .14 + rng() * .16});
        }
        return neonProfiles.get(index);
    }
    function visibleEffects() {
        const enabled = motion.intensity > 0, t = motion.activityTime;
        for (const runtime of welding) {
            const {state} = runtime;
            state.active = enabled && t >= runtime.start && t < runtime.end;
            const arcNoise = runtime.noiseFrom + (runtime.noiseTo - runtime.noiseFrom) * smooth(clamp((t - runtime.noiseStart) / Math.max(.001, runtime.noiseEnd - runtime.noiseStart), 0, 1));
            const edge = smooth(clamp((t - runtime.start) / .025, 0, 1)) * smooth(clamp((runtime.end - t) / .035, 0, 1));
            state.brightness = state.active ? runtime.power * arcNoise * edge : 0;
            for (const spark of state.sparks) {
                spark.heat = Math.max(0, 1 - spark.age / spark.life);
                spark.alpha = enabled ? Math.pow(spark.heat, 1.65) : 0;
            }
        }
        for (const lamp of lamps) {
            // Local supply dips occur at different times. The practical lamps
            // remain lit, with no shared sine wave making the room breathe.
            const age = t - lamp.start;
            const dip = t < lamp.end && age >= 0
                ? lamp.dip * smooth(clamp(age / .15, 0, 1)) * smooth(clamp((lamp.end - t) / .35, 0, 1)) : 0;
            lamp.state.brightness = enabled ? (lamp.base - dip) * (.85 + .15 * motion.intensity) : 0;
        }
    }
    motion.beaconBrightness = index => {
        const beacon = beacons[index] ?? {period: 3.5, phase: index * 2.1};
        return .025 + .975 * Math.pow(Math.max(0, Math.sin(motion.time * TAU / beacon.period + beacon.phase)), 8);
    };
    motion.sequenceBrightness = (index, lightIndex) => {
        const sequence = (data.SEQUENCE_LIGHTS ?? [])[index] ?? {}, count = sequence.points?.length ?? 1;
        const phase = fraction(motion.time / Math.max(4, (sequence.period ?? 4.5) * 1.5) + (sequence.phase ?? index * .27));
        const distance = Math.abs(fraction(lightIndex / Math.max(1, count) - phase + .5) - .5);
        // All emitters stay at their surveyed positions; only their intensity
        // changes. The edge remains visible between the brighter guide pulses.
        return .18 + .82 * Math.exp(-distance * distance / .016);
    };
    motion.neonBrightness = index => {
        const profile = neonProfile(index);
        const pulse = .35 + .60 * (.5 + .5 * Math.sin(motion.time * TAU / profile.period + profile.phase));
        const dipAge = fraction(motion.time / profile.dipPeriod + profile.dipOffset) * profile.dipPeriod;
        const dip = dipAge < profile.dipDuration
            ? .86 * Math.sin(Math.PI * dipAge / profile.dipDuration) ** 2 : 0;
        return pulse * (1 - dip);
    };
    motion.update = (dt, intensity = 1) => {
        motion.intensity = clamp(Number.isFinite(intensity) ? intensity : 1, 0, 1);
        dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        if (!dt) {visibleEffects(); return motion;}
        motion.time += dt;
        for (const state of motion.windows) {
            if (motion.time >= state.next) {
                state.on = !state.on; state.from = state.value; state.start = motion.time;
                state.fade = state.on ? between(.15, .4) : between(.35, .8);
                state.next = motion.time + state.fade + (state.on ? between(15, 65) : between(5, 20));
            }
            state.value = state.from + ((state.on ? 1 : 0) - state.from) * smooth(clamp((motion.time - state.start) / state.fade, 0, 1));
        }
        const delta = dt * motion.intensity;
        motion.activityTime += delta;
        if (delta > 0) {
            for (const runtime of travellers) {
                const {state, path, source} = runtime;
                const canWalk = motion.activityTime >= runtime.stopUntil && path.length > .1;
                const remainingDistance = runtime.direction > 0 ? (1 - state.progress) * path.length : state.progress * path.length;
                const approach = runtime.loop ? 1 : clamp(remainingDistance / Math.max(.4, runtime.speed * .65), .08, 1);
                const plannedStop = clamp((runtime.nextStop - motion.activityTime) / .7, 0, 1);
                const targetSpeed = canWalk ? runtime.speed * Math.min(approach, plannedStop) : 0;
                runtime.movingSpeed += (targetSpeed - runtime.movingSpeed) * Math.min(1, delta * 4);
                state.walking = canWalk;
                state.working = !canWalk;
                state.armPhase += delta * (state.working ? 1.15 : .5);
                if (canWalk) {
                    const oldX = state.x, oldY = state.y;
                    state.progress += runtime.direction * runtime.movingSpeed * delta / path.length;
                    const reachedEnd = state.progress <= 0 || state.progress >= 1 || (!runtime.loop && remainingDistance < .025);
                    if (runtime.loop && reachedEnd) state.progress = fraction(state.progress);
                    else if (reachedEnd) {state.progress = runtime.direction > 0 ? 1 : 0; runtime.direction *= -1;}
                    if ((!runtime.loop && reachedEnd) || motion.activityTime >= runtime.nextStop) {
                        runtime.stopUntil = motion.activityTime + Math.max(3, range(source.dwell, 4) * between(1.15, 1.9));
                        runtime.nextStop = runtime.stopUntil + between(17, 34);
                        runtime.movingSpeed = 0;
                        state.walking = false; state.working = true;
                    }
                    [state.x, state.y] = along(path, state.progress);
                    const dx = state.x - oldX, dy = state.y - oldY, distance = Math.hypot(dx, dy);
                    if (distance > .00001) {state.heading = dx < 0 ? -1 : 1; state.angle = Math.atan2(dy, dx);}
                    // Gait follows distance travelled, including acceleration.
                    state.phase += distance / Math.max(1, state.height * .24) * TAU;
                    state.height = runtime.height * clamp(1 + (state.y - runtime.middleY) * .0022, .94, 1.06);
                }
                const targetStride = state.walking ? Math.sin(state.phase) * clamp(runtime.movingSpeed / runtime.speed, 0, 1) : 0;
                state.stride += (targetStride - state.stride) * Math.min(1, delta * 10);
            }
            for (const runtime of welding) {
                const {state} = runtime, t = motion.activityTime;
                if (t >= runtime.next) {
                    if (!runtime.remaining) runtime.remaining = 2 + Math.floor(random() * 4);
                    runtime.remaining--;
                    runtime.start = t; runtime.end = t + between(.10, .29);
                    runtime.next = runtime.end + (runtime.remaining ? between(.09, .35) : between(3.2, 9.5));
                    runtime.nextSpark = t + between(.015, .055);
                    runtime.power = between(.72, .94);
                    runtime.noiseFrom = runtime.noiseTo = between(.75, 1);
                    runtime.noiseStart = t; runtime.noiseEnd = t;
                }
                if (t < runtime.end && t >= runtime.noiseEnd) {
                    runtime.noiseFrom = runtime.noiseTo; runtime.noiseTo = between(.58, 1);
                    runtime.noiseStart = t; runtime.noiseEnd = t + between(.045, .10);
                }
                if (t < runtime.end && t >= runtime.nextSpark && state.sparks.length < 12) {
                    const angle = between(-Math.PI, 0), speed = between(6, 18);
                    state.sparks.push({x: state.tool[0], y: state.tool[1], vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed, age: 0, life: between(.17, .42),
                        alpha: 1, heat: 1, length: between(.35, 1.05), angle});
                    runtime.nextSpark = t + between(.055, .11);
                }
                for (let i = state.sparks.length - 1; i >= 0; i--) {
                    const spark = state.sparks[i]; spark.age += delta;
                    if (spark.age >= spark.life) {state.sparks.splice(i, 1); continue;}
                    spark.vy += delta * 32; spark.x += spark.vx * delta; spark.y += spark.vy * delta;
                    spark.angle = Math.atan2(spark.vy, spark.vx);
                }
            }
            for (const lamp of lamps) if (motion.activityTime >= lamp.nextDip) {
                lamp.start = motion.activityTime; lamp.end = lamp.start + between(.5, 1.2);
                lamp.dip = between(.08, .18); lamp.nextDip = lamp.end + between(12, 32);
            }
        }
        visibleEffects(); return motion;
    };
    visibleEffects(); return motion;
}

window.STATION_MOTION = Object.freeze({createStationMotion});
})();
