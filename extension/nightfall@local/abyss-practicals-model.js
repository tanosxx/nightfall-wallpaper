// Native model: identical schedules and geometry from abyss-practicals.js.

    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
    const hash = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

    // id, x, y, rx, ry, halo, first event, behaviour, emitter kind.
    // Rooms, the main observatory glazing and the x632–640 lift are excluded.
    const measured = [
        ['west-service-platform',       856.5,399,  2.5,1.8,11, 1.1, 'flutter','point'],
        ['west-lower-service-platform', 856.5,520.5,3.4,1.8,12, 9.7, 'flutter','point'],
        ['central-upper-railing',       967.5,419.5,1.4,1.5, 6,13.2, 'flutter','point'],
        ['under-observatory-service',  1081.5,365.5,1.5,1.5, 7, 8.4, 'switch', 'point'],
        ['east-service-platform',     1236.5,400,  2.8,2.1,13, 2.4, 'flutter','point'],
        ['east-bridge-west-post',      1343,491,    2.1,2.5,13, 6.6, 'flutter','point'],
        ['east-bridge-east-post',      1389.5,499.5,1.8,2.1,12,17.8, 'flutter','point'],
        ['east-gantry-double-lamp',    1282,444,    4.5,1.5, 8,11.5, 'flutter','point'],
        ['central-column-wall-lamp',  1099,479.5,  5.8,2.6,12,15.3, 'flutter','strip'],
        ['central-lower-ring-lamp',     878,621,    2.6,1.8,10,19.1, 'flutter','point'],
        ['west-tower-base-platform',    507,491,    3.4,1.5, 7,21.6, 'flutter','point'],
        ['west-tower-wall-lamp',        508.5,431,  1.7,1.9, 7,25.9, 'flutter','point'],
        ['west-tunnel-service-platform',792.5,471.5,1.5,1.3,6,14.7, 'flutter','point'],
        ['roof-mast-amber-lamp',       1098.5,113,  1.1,1.4, 6,20.4, 'flutter','point'],
        ['roof-upper-service-lamp',    1126,156,    1.3,1,   5,28.7, 'flutter','point'],
        ['roof-west-wall-lamp',        1121.5,170,  1,1.8,   5,24.1, 'switch', 'point'],
        ['roof-east-wall-lamp',        1224,170.5,  1,1.7,   5,31.5, 'flutter','point'],
        ['east-tower-upper-platform',  1486,125.5,  1.6,1.1, 6,18.3, 'flutter','point'],
        ['east-tower-roof-strip',      1526.5,124,  6,1.1,   7,22.8, 'flutter','strip'],
        ['east-tower-lower-door-strip',1526,528.5,  9,2.2,  11,15.8, 'switch', 'strip'],
        ['east-tower-mid-door-strip',  1580,409,    5,2.1,  10,27.2, 'switch', 'strip'],
        ['central-service-door-strip',1064,575,    5.1,2.1,11,17.1, 'switch', 'strip'],
        ['central-front-rail-strip',    938,422,    7.5,1.4, 7,10.6, 'flutter','strip'],
        ['east-passage-door-strip',    1361,387.5, 11,1.7,   9,20.3, 'switch', 'strip'],
        ['west-tower-eaves-pair',       540.5,356,  4,1.2,   6,23.7, 'flutter','point'],
    ];

    // Measured warm irradiance on opaque surfaces, separate from the bulb halo.
    // width is a half-width. points bound the actual receiving wall/deck and
    // exclude intervening cables and neighbouring lights; they are not shapes
    // to paint. A radiance decomposition can use these as source-image ROIs.
    const illuminatedSurfaces = {
        'central-column-wall-lamp': {
            endX:1095,endY:559,width:45,surface:'column-wall',
            axis:[[1099,479.5],[1097,516],[1095,559]],
            points:[[1089,480],[1108,480],[1118,495],[1118,558],
                [1054,554],[1057,528],[1071,499]],
        },
        'central-service-door-strip': {
            endX:1062,endY:598,width:17,surface:'service-door',
            axis:[[1064,575],[1063,586],[1062,598]],
            points:[[1057,576],[1070,576],[1078,588],[1075,598],
                [1047,594],[1048,584]],
        },
        'east-tower-lower-door-strip': {
            endX:1525,endY:550,width:18,surface:'service-door',
            axis:[[1526,528.5],[1526,539],[1525,550]],
            // The separate low lamp near (1511,551) is outside this ROI.
            points:[[1517,529],[1537,532],[1540,544],[1534,550],
                [1518,549],[1509,540]],
        },
        'east-tower-mid-door-strip': {
            endX:1582,endY:430,width:19,surface:'wall-and-deck',
            axis:[[1580,409],[1580,419],[1582,430]],
            points:[[1574,410],[1586,410],[1598,419],[1601,428],
                [1570,431],[1561,422]],
        },
    };

    const lamps = measured.map((row, index) => {
        const [id,x,y,rx,ry,halo,first,behaviour,kind] = row;
        const beam = illuminatedSurfaces[id];
        return Object.freeze({id,x,y,rx,ry,halo,period:32 + hash(index + 7) * 29,
            phase:-first,behaviour,kind,...(beam ? {beam:Object.freeze(beam)} : {})});
    });

    function eventFor(index, cycle = 0) {
        const lamp = lamps[index];
        const seed = index * 151 + cycle * 269;
        const start = -lamp.phase + cycle * lamp.period + (cycle ? hash(seed + 31) * 4.5 : 0);
        if (lamp.behaviour === 'switch') {
            return {start,duration:5.5 + hash(seed + 17) * 5.5,
                low:.025 + hash(seed + 23) * .045,fade:.18 + hash(seed + 41) * .23};
        }
        const duration = 2.4 + hash(seed + 43) * .8;
        const jitter = key => (hash(seed + key) - .5) * .035;
        const low = key => .04 + hash(seed + key) * .14;
        const a = low(47), b = low(59), c = low(71);
        const knots = [[0,1],[.08+jitter(53),a],[.21+jitter(61),a],
            [.30+jitter(67),1],[.38+jitter(73),1],[.46+jitter(79),b],
            [.58+jitter(83),b],[.67+jitter(89),1],[.74+jitter(97),1],
            [.81+jitter(101),c],[.91+jitter(103),c],[1,1]];
        return {start,duration,knots};
    }

    function brightness(index, time) {
        const lamp = lamps[index];
        const elapsed = time + lamp.phase;
        if (elapsed <= 0) return 1;
        const cycle = Math.floor(elapsed / lamp.period);
        const event = eventFor(index, cycle);
        const local = time - event.start;
        if (local <= 0 || local >= event.duration) return 1;
        if (lamp.behaviour === 'switch') {
            const off = smooth(local / event.fade) * smooth((event.duration - local) / event.fade);
            return 1 - (1 - event.low) * off;
        }
        const phase = local / event.duration;
        for (let k = 1; k < event.knots.length; k++) {
            const a = event.knots[k - 1], b = event.knots[k];
            if (phase <= b[0]) return a[1] + (b[1] - a[1]) * smooth((phase - a[0]) / (b[0] - a[0]));
        }
        return 1;
    }

    function sample(time) {
        const t = Number.isFinite(time) ? Math.max(0,time) : 0;
        return lamps.map((_, index) => brightness(index,t));
    }


export const Model = {lamps,sample,eventFor};
