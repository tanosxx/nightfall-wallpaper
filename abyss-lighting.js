/* Photographic light fixtures for the 1672 × 941 abyss artwork.
 * All animation is sampled from scene time; paused frames are identical.
 * Positive light layers rebuild the source over an ambient photographic plate.
 */
(function () {
    'use strict';

    const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
    const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
    const hash = value => { const x = Math.sin(value * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

    // Small rooms only. The large observatory and the lift shaft at x632–640
    // belong to their own activity renderers. These coordinates are art pixels.
    const WINDOWS = [
        {id: 'rear-lab-west', points: [[745,274],[759,275],[759,294],[745,293]], depth: .96},
        {id: 'rear-lab-west-inner', points: [[762,275],[774,274],[774,294],[762,294]], depth: .98},
        {id: 'rear-lab-middle', points: [[777,274],[787,272],[787,293],[777,294]], depth: .94},
        {id: 'rear-lab-east-inner', points: [[790,272],[800,271],[800,291],[790,293]], depth: .97},
        {id: 'rear-lab-east', points: [[803,271],[811,270],[811,289],[803,291]], depth: .95},
        {id: 'rear-lab-side', points: rect(687,270,20,23), depth: .96},
        {id: 'rear-service-west', points: rect(657,305,10,9), depth: .94},
        {id: 'rear-tower-upper', points: rect(742,336,17,19), depth: .98},
        {id: 'rear-tower-lower', points: rect(746,356,13,18), depth: .96},
        {id: 'west-lab-one', points: [[472,351],[478,354],[478,373],[472,370]], depth: .95},
        {id: 'west-lab-two', points: [[481,355],[488,356],[488,378],[481,375]], depth: .98},
        {id: 'west-lab-three', points: [[497,355],[513,356],[513,380],[497,378]], depth: .94},
        {id: 'west-lab-four', points: [[516,356],[532,356],[532,380],[516,380]], depth: .96},
        {id: 'west-tower-upper', points: rect(533,399,14,17), depth: .97},
        {id: 'west-tower-lower', points: rect(533,416,14,24), depth: .98},
        {id: 'west-service-room', points: rect(505,423,10,14), depth: .95},
        {id: 'middle-service-one', points: rect(844,446,7,12), depth: .97},
        {id: 'middle-service-two', points: rect(852,448,9,15), depth: .95},
        {id: 'central-tower-one', points: rect(990,460,21,23), depth: .98},
        {id: 'central-tower-two', points: rect(989,489,22,24), depth: .96},
        {id: 'central-tower-three', points: rect(989,520,22,25), depth: .98},
        {id: 'central-tower-four', points: rect(989,555,16,25), depth: .95},
        {id: 'central-tower-five', points: rect(988,591,24,36), depth: .97},
        {id: 'central-tower-six', points: rect(988,685,16,21), depth: .96},
        {id: 'central-tower-seven', points: rect(987,729,17,25), depth: .98},
        {id: 'east-tower-top', points: rect(1610,0,18,21), depth: .95},
        {id: 'east-tower-upper', points: rect(1608,29,19,25), depth: .98},
        {id: 'east-tower-middle', points: rect(1601,74,25,23), depth: .96},
        {id: 'east-tower-mezzanine', points: rect(1606,99,18,15), depth: .94},
        {id: 'east-tower-room', points: rect(1602,198,18,24), depth: .98},
        {id: 'east-tower-lower-room', points: rect(1602,227,17,25), depth: .96},
        {id: 'east-tower-bottom-room', points: rect(1599,254,19,30), depth: .98},
        {id: 'east-service-upper', points: rect(1597,329,18,22), depth: .97},
        {id: 'east-service-lower', points: rect(1595,353,19,24), depth: .96},
    ];
    const BEACONS = [
        {x:1013,y:52,r:1.2,period:3.7,offset:.3},
        {x:1210,y:87,r:1.15,period:4.3,offset:1.9},
        {x:754,y:230,r:.8,period:3.1,offset:1},
        {x:540,y:315,r:.7,period:4.7,offset:2.8},
        {x:584,y:318,r:.65,period:3.8,offset:.6},
    ];
    const WORKLAMPS = [
        {id:'west-cliff',x:485,y:400,rx:5,ry:2.5,first:10.7,
            beam:{endX:391,endY:566,width:67}},
        {id:'central-upper',x:938,y:438,rx:9,ry:3.5,first:4.3,
            beam:{endX:922,endY:642,width:55}},
        {id:'lower-cliff',x:776,y:592,rx:6,ry:3.5,first:18.4,
            beam:{endX:703,endY:705,width:63}},
        {id:'central-lower',x:936,y:677,rx:10,ry:4.5,first:26.1,
            beam:{endX:908,endY:840,width:63}},
        {id:'east-cliff',x:1329,y:558,rx:12,ry:6.5,first:13.8,
            beam:{endX:1278,endY:729,width:78}},
        {id:'east-upper-cliff',x:1471,y:148,rx:6.5,ry:2,first:32.2,
            beam:{endX:1424,endY:243,width:48}},
        {id:'east-upper-column',x:1527,y:144,rx:8.5,ry:2,first:23.9,
            beam:{endX:1525,endY:286,width:49}},
    ];

    const schedules = WINDOWS.map((fixture, i) => ({
        period: 39 + hash(i + 21) * 52,
        offset: hash(i + 71) * 90,
        fade: .55 + hash(i + 53) * .7,
        depth: fixture.depth,
    }));

    // Each 36-second slot gets a new start jitter, depth and burst pattern.
    // The actual quiet gap is 23–43 seconds; there is no repeating flash train.
    function lampEvent(index, cycle = 0) {
        const fixture = WORKLAMPS[index];
        const seed = index * 149 + cycle * 233;
        const duration = 2.7 + hash(seed + 9) * 1.1;
        const jitter = cycle === 0 ? 0 : hash(seed + 21) * 9;
        const start = fixture.first + cycle * 36 + jitter;
        const wiggle = (key, amplitude) => (hash(seed + key) - .5) * amplitude;
        const depths = [0,1,2].map(k => .79 + hash(seed + k * 31 + 11) * .15);
        const knots = [
            [0,0], [.07 + wiggle(37,.025),depths[0]], [.23 + wiggle(41,.04),depths[0]],
            [.30 + wiggle(43,.025),0], [.38 + wiggle(47,.025),0],
            [.45 + wiggle(53,.025),depths[1]], [.57 + wiggle(59,.035),depths[1]],
            [.65 + wiggle(61,.025),0], [.72 + wiggle(67,.025),0],
            [.79 + wiggle(71,.025),depths[2]], [.90 + wiggle(73,.025),depths[2]], [1,0],
        ];
        return {start, duration, end:start + duration, knots};
    }

    function sampleLamp(index, time) {
        const fixture = WORKLAMPS[index];
        if (time < fixture.first) return 0;
        const cycle = Math.floor((time - fixture.first) / 36);
        const event = lampEvent(index, cycle);
        const phase = (time - event.start) / event.duration;
        if (phase <= 0 || phase >= 1) return 0;
        for (let k = 1; k < event.knots.length; k++) {
            const previous = event.knots[k - 1], next = event.knots[k];
            if (phase <= next[0]) {
                const blend = smooth((phase - previous[0]) / (next[0] - previous[0]));
                return previous[1] + (next[1] - previous[1]) * blend;
            }
        }
        return 0;
    }

    function sample(time) {
        const t = Math.max(0, Number.isFinite(time) ? time : 0);
        return {
            windows: schedules.map((item, i) => {
                const elapsed = t + item.offset;
                const cycle = Math.floor(elapsed / item.period);
                const phase = elapsed % item.period;
                const start = item.period * (.08 + hash(i * 17 + cycle * 31) * .4);
                const duration = 7 + hash(i * 11 + cycle * 37) * Math.min(12, item.period * .24);
                const end = start + duration;
                const envelope = smooth((phase - start) / item.fade) * smooth((end - phase) / item.fade);
                return envelope * item.depth * (.96 + .04 * hash(i * 29 + cycle * 19));
            }),
            beacons: BEACONS.map(fixture => {
                const phase = ((t + fixture.offset) % fixture.period) / fixture.period;
                const rise = smooth((phase - .08) / .13);
                const fall = 1 - smooth((phase - .26) / .29);
                return .035 + .965 * rise * fall;
            }),
            worklamps: WORKLAMPS.map((_, i) => sampleLamp(i, t)),
        };
    }

    window.ABYSS_LIGHTING = {windows: WINDOWS, beacons: BEACONS, worklamps: WORKLAMPS,
        windowSchedules: schedules, lampEvent, sample};
    window.createAbyssLighting = photo => window.createAbyssRadiance(photo, window.ABYSS_LIGHTING, window.ABYSS_PRACTICALS);
})();
