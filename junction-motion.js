/* A scene clock, not an advancing simulation: the same time always gives the
 * same state, including after pause/resume, tab suspension, or seeking. */
(() => {
    'use strict';
    const clamp = n => Math.max(0, Math.min(1, n));
    const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
    const validTime = t => Number.isFinite(t) && t >= 0 ? t : 0;
    const aspects = ['red', 'amber', 'green'];
    const signalFade = .26;
    const switchDuration = 1.6;

    const tracks = [
        {id: 'lower', first: 4, direction: 1, carSpacing: .12, signalDistance: .22,
            intervals: [76, 89, 64, 93, 71, 84, 60, 87],
            durations: [25, 28, 23, 27, 24, 29, 22, 26],
            cars: [11, 13, 10, 12, 11, 13, 9, 12]},
        {id: 'upper', first: 27, direction: -1, carSpacing: .09, signalDistance: .05,
            intervals: [91, 66, 82, 74, 94, 61, 86, 79],
            durations: [26, 23, 28, 25, 29, 22, 27, 24],
            cars: [12, 10, 13, 11, 13, 9, 12, 11]},
    ].map(track => {
        let period = 0;
        const offsets = track.intervals.map(interval => {
            const offset = period; period += interval; return offset;
        });
        return Object.freeze({...track, period, offsets: Object.freeze(offsets),
            intervals: Object.freeze(track.intervals), durations: Object.freeze(track.durations),
            cars: Object.freeze(track.cars)});
    });

    const serviceSignals = Object.freeze([
        {id: 'yard-west', phase: 2.1, durations: [17.2, 3.4, 11.3]},
        {id: 'yard-east', phase: 12.7, durations: [23.1, 4.7, 16.6]},
        {id: 'high-siding', phase: 7.4, durations: [29.7, 3.2, 19.5]},
        {id: 'platform', phase: 19.8, durations: [14.9, 5.1, 13.7]},
        {id: 'distant', phase: 4.3, durations: [37.1, 4.2, 24.8]},
        {id: 'maintenance', phase: 30.6, durations: [21.3, 6.2, 31.4]},
    ].map(s => Object.freeze({...s, durations: Object.freeze(s.durations)})));

    function eventAt(track, index) {
        if (index < 0) return null;
        const n = track.intervals.length, local = index % n;
        const start = track.first + Math.floor(index / n) * track.period + track.offsets[local];
        const duration = track.durations[local];
        return {index, start, end: start + duration, duration, cars: track.cars[local]};
    }

    function eventsAt(track, time) {
        if (time < track.first) return {previous: null, next: eventAt(track, 0)};
        const relative = time - track.first;
        const cycle = Math.floor(relative / track.period), localTime = relative - cycle * track.period;
        let local = track.offsets.length - 1;
        while (local > 0 && track.offsets[local] > localTime) local--;
        const index = cycle * track.offsets.length + local;
        return {previous: eventAt(track, index), next: eventAt(track, index + 1)};
    }

    function blendAspect(from, to, elapsed) {
        const blend = smooth(elapsed / signalFade);
        const levels = {red: 0, amber: 0, green: 0};
        levels[from] += 1 - blend; levels[to] += blend;
        return {aspect: to, levels};
    }

    function entrySignal(track, time, events) {
        // Hold green until the head has passed the source-aligned signal
        // post, then protect the occupied block behind the train. Distances
        // are measured along each projected route in its travel direction.
        // An unrelated track's schedule cannot change this signal.
        const transitions = [];
        for (const event of [events.previous, events.next]) {
            if (!event) continue;
            const passedSignal = event.start + event.duration * track.signalDistance /
                (1 + event.cars * track.carSpacing) + .15;
            transitions.push({time: event.start - 10, from: 'red', to: 'amber'},
                {time: event.start - 6.2, from: 'amber', to: 'green'},
                {time: passedSignal, from: 'green', to: 'red'});
        }
        let last = null;
        for (const transition of transitions)
            if (transition.time <= time && (!last || transition.time > last.time)) last = transition;
        const state = last ? blendAspect(last.from, last.to, time - last.time)
            : {aspect: 'red', levels: {red: 1, amber: 0, green: 0}};
        return {id: `${track.id}-entry`, track: track.id, role: 'entry', ...state};
    }

    function serviceSignal(config, time) {
        const period = config.durations.reduce((sum, n) => sum + n, 0);
        let local = (time + config.phase) % period, index = 0;
        while (index < 2 && local >= config.durations[index]) local -= config.durations[index++];
        return {id: config.id, track: null, role: 'service',
            ...blendAspect(aspects[(index + 2) % 3], aspects[index], local)};
    }

    function trackSwitch(track, time, events, active) {
        // Set the route eight seconds after the previous tail has cleared.
        // This leaves at least 21 seconds before the next train and cannot
        // move points underneath either the locomotive or the last carriage.
        const previous = events.previous;
        let position = 0, target = 0, moving = false;
        if (previous) {
            const initial = previous.index % 2;
            const changeAt = previous.end + 8;
            const phase = clamp((time - changeAt) / switchDuration);
            target = time >= changeAt ? 1 - initial : initial;
            position = initial + (1 - 2 * initial) * smooth(phase);
            moving = time > changeAt && time < changeAt + switchDuration;
        }
        return {id: `${track.id}-points`, track: track.id, position, target, moving, locked: active};
    }

    function sample(inputTime) {
        const time = validTime(inputTime), trains = [], signals = [], switches = [];
        for (const track of tracks) {
            const events = eventsAt(track, time);
            const event = events.previous ?? events.next;
            const active = time >= event.start && time < event.end;
            const progress = clamp((time - event.start) / event.duration);
            const span = event.cars * track.carSpacing;
            // progress covers the complete passage, including the tail.
            // span may exceed 1: these long consists extend beyond the view.
            // head = progress * (1 + span). For carriage i, use the route
            // coordinate head - (i + .5) * span / cars. Cull u outside 0..1.
            // direction=-1 means evaluate the route at 1-u. Do not reverse
            // progress or ease it: trains maintain a constant cruise speed.
            trains.push({id: track.id, active, progress, head: progress * (1 + span),
                span, cars: event.cars, direction: track.direction, start: event.start,
                end: event.end, duration: event.duration, index: event.index});
            signals.push(entrySignal(track, time, events));
            switches.push(trackSwitch(track, time, events, active));
        }
        for (const config of serviceSignals) signals.push(serviceSignal(config, time));
        return {time, trains, signals, switches};
    }

    window.JUNCTION_MOTION = Object.freeze({sample, tracks: Object.freeze(tracks),
        serviceSignals, eventAt, signalFade, switchDuration});
})();
