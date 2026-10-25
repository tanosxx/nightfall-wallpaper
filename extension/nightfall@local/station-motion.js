/* Shared station animation. All hangar coordinates use source-image pixels.
 * The background and star field never move; there are no flying ships. */
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

export function createStationMotion(data, seed) {
    const random = generator(seed), between = (a, b) => a + random() * (b - a);
    const range = (v, fallback) => Array.isArray(v) ? between(v[0], v[1]) : Number.isFinite(v) ? v : fallback;
    const hangar = data.HANGAR ?? {};
    const motion = {
        time: 0, activityTime: 0, intensity: 1,
        windows: (data.STATION_LIGHTS ?? []).map(() => {
            const on = random() < .78;
            return {on, value: on ? 1 : 0, from: on ? 1 : 0, start: 0, fade: .25,
                next: on ? between(1.5, 42) : between(1.5, 14)};
        }),
        workers: [], welders: [], workLights: [],
    };
    const travellers = [];
    function traveller(source, index) {
        const path = makePath(source.path ?? []), direction = random() < .5 ? -1 : 1;
        const state = {id: source.id ?? `worker-${index}`,
            x: 0, y: 0, height: source.height,
            color: source.color ?? [148, 114, 63],
            heading: direction, angle: 0, walking: false, working: false,
            phase: between(0, TAU), stride: 0, progress: between(.08, .92),
            armPhase: between(0, TAU)};
        const runtime = {source, state, path, direction, speed: Math.max(.1, source.speed ?? 2),
            stopUntil: index % 3 === 1 ? between(.5, 2.8) : 0,
            nextStop: between(5, 18),
            loop: path.points.length > 2 && Math.hypot(path.points[0][0] - path.points.at(-1)[0], path.points[0][1] - path.points.at(-1)[1]) < 1};
        [state.x, state.y] = along(path, state.progress);
        travellers.push(runtime); return state;
    }
    motion.workers = (hangar.workers ?? []).map((s, i) => traveller(s, i));
    const welding = (hangar.welders ?? []).map((source, index) => {
        const state = {id: source.id ?? `welder-${index}`, x: source.x, y: source.y,
            height: source.height ?? 10, tool: [...(source.tool ?? [source.x + 3, source.y - 4])],
            color: source.color ?? [122, 125, 119], active: false, brightness: 0, sparks: [], phase: between(0, TAU)};
        motion.welders.push(state);
        return {state, next: between(.1, 1.8), end: 0, nextSpark: 0, pulse: between(0, TAU)};
    });
    motion.workLights = (hangar.workLights ?? []).map(() => ({brightness: 0}));
    function visibleEffects() {
        const enabled = motion.intensity > 0;
        for (const runtime of welding) {
            const {state} = runtime;
            state.active = enabled && motion.activityTime < runtime.end;
            state.brightness = state.active ? .62 + .38 * Math.abs(Math.sin(motion.activityTime * 47 + runtime.pulse)) : 0;
            for (const spark of state.sparks) spark.alpha = enabled ? Math.max(0, 1 - spark.age / spark.life) : 0;
        }
        motion.workLights.forEach((state, index) => {
            const light = hangar.workLights[index];
            state.brightness = enabled ? (.50 + .28 * (.5 + .5 * Math.sin(motion.activityTime * TAU / (light.period ?? 6) + (light.phase ?? index)))) * (.8 + .2 * motion.intensity) : 0;
        });
    }
    motion.beaconBrightness = index => {
        const beacon = (data.BEACONS ?? [])[index] ?? {};
        return .06 + .94 * Math.pow(Math.max(0, Math.sin(motion.time * TAU / Math.max(.9, beacon.period ?? 3.5) + (beacon.phase ?? index * 2.1))), 10);
    };
    motion.sequenceBrightness = (index, lightIndex) => {
        const sequence = (data.SEQUENCE_LIGHTS ?? [])[index] ?? {}, count = sequence.points?.length ?? 1;
        const phase = fraction(motion.time / Math.max(1, sequence.period ?? 4.5) + (sequence.phase ?? index * .27));
        const distance = Math.abs(fraction(lightIndex / Math.max(1, count) - phase + .5) - .5);
        return .12 + .88 * Math.exp(-distance * distance / .007);
    };
    motion.update = (dt, intensity = 1) => {
        motion.intensity = clamp(Number.isFinite(intensity) ? intensity : 1, 0, 1);
        dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        if (!dt) {visibleEffects(); return motion;}
        motion.time += dt;
        for (const state of motion.windows) {
            if (motion.time >= state.next) {
                state.on = !state.on; state.from = state.value; state.start = motion.time; state.fade = between(.15, .45);
                state.next = motion.time + state.fade + (state.on ? between(9, 42) : between(3, 14));
            }
            state.value = state.from + ((state.on ? 1 : 0) - state.from) * smooth(clamp((motion.time - state.start) / state.fade, 0, 1));
        }
        const delta = dt * motion.intensity;
        motion.activityTime += delta;
        if (delta > 0) {
            for (const runtime of travellers) {
                const {state, path, source} = runtime;
                state.walking = motion.activityTime >= runtime.stopUntil && path.length > .1;
                state.working = !state.walking;
                state.armPhase += delta * (state.working ? 2.2 : .8);
                if (state.walking) {
                    state.progress += runtime.direction * runtime.speed * delta / path.length;
                    let reachedEnd = state.progress <= 0 || state.progress >= 1;
                    if (runtime.loop && reachedEnd) state.progress = fraction(state.progress);
                    else if (reachedEnd) {state.progress = clamp(state.progress, 0, 1); runtime.direction *= -1;}
                    if ((!runtime.loop && reachedEnd) || motion.activityTime >= runtime.nextStop) {
                        runtime.stopUntil = motion.activityTime + range(source.dwell, 2);
                        runtime.nextStop = runtime.stopUntil + between(7, 18);
                        state.walking = false; state.working = true;
                    }
                    const oldX = state.x, oldY = state.y;
                    [state.x, state.y] = along(path, state.progress);
                    const dx = state.x - oldX, dy = state.y - oldY;
                    if (Math.abs(dx) + Math.abs(dy) > .00001) {state.heading = dx < 0 ? -1 : 1; state.angle = Math.atan2(dy, dx);}
                    state.phase += delta * runtime.speed / Math.max(1, state.height * .13) * TAU;
                }
                const targetStride = state.walking ? Math.sin(state.phase) : 0;
                state.stride += (targetStride - state.stride) * Math.min(1, delta * 12);
            }
            for (const runtime of welding) {
                const {state} = runtime;
                if (motion.activityTime >= runtime.next) {
                    runtime.end = motion.activityTime + between(.12, .50);
                    runtime.next = runtime.end + between(.30, 1.65) + (random() < .18 ? between(1, 3) : 0);
                    runtime.nextSpark = motion.activityTime;
                }
                if (motion.activityTime < runtime.end && motion.activityTime >= runtime.nextSpark && state.sparks.length < 18) {
                    const angle = between(-Math.PI, 0), speed = between(8, 24);
                    state.sparks.push({x: state.tool[0], y: state.tool[1], vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed, age: 0, life: between(.15, .40),
                        alpha: 1, length: between(.55, 1.5), angle});
                    runtime.nextSpark = motion.activityTime + between(.025, .065);
                }
                for (let i = state.sparks.length - 1; i >= 0; i--) {
                    const spark = state.sparks[i]; spark.age += delta;
                    if (spark.age >= spark.life) {state.sparks.splice(i, 1); continue;}
                    spark.vy += delta * 44; spark.x += spark.vx * delta; spark.y += spark.vy * delta;
                    spark.angle = Math.atan2(spark.vy, spark.vx);
                }
            }
        }
        visibleEffects(); return motion;
    };
    visibleEffects(); return motion;
}
