/* Shared Canvas/Cairo sky effects. All coordinates belong to the 1672×941
 * photograph. Ship hulls remain in the original image; only emissions,
 * smoke, and burning fragments move. No DOM or wall-clock state. */

export const SKY_ASSET_FILES = Object.freeze({
    emissions: 'sky-emissions.png',
    smoke0: 'sky-smoke-0.png',
    smoke1: 'sky-smoke-1.png',
    smoke2: 'sky-smoke-2.png',
    flame: 'sky-flame.png',
    burst: 'sky-burst.png',
    glow: 'sky-glow.png',
    flow: 'sky-flow.png',
});

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hash = n => {const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s);};
const smooth = v => {v = clamp(v); return v * v * (3 - 2 * v);};
const lifeFade = u => smooth(u / .17) * smooth((1 - u) / .30);
const cleanTime = t => Number.isFinite(t) ? Math.max(0, t) : 0;
const cleanIntensity = v => Number.isFinite(v) ? clamp(v, 0, 1.8) : 1;

// Isolated regions in the photographic emission atlas. Their alpha contains
// orange fire pixels only: no dark patch or rectangular photo is composited.
const EMISSIONS = [
    [1082, 9, 118, 111, 1], [1199, 47, 83, 113, 2],
    [1191, 160, 94, 71, 3], [1282, 111, 120, 131, 4],
    [808, 65, 100, 108, 5], [1421, 0, 66, 94, 6],
    [1524, 63, 82, 148, 7], [1474, 173, 70, 101, 8],
];

// x,y,upper-left drift(px/s), life, initial width, count, depth.
const TRAILS = [
    [1108, 82, -22, -27, 5.9, 42, 11, 1],
    [1200, 68, -17, -25, 5.4, 26, 8, .86],
    [1356, 208, -21, -27, 5.5, 25, 7, .78],
    [846, 111, -11, -15, 4.7, 19, 7, .42],
    [1459, 63, -5, -15, 4.7, 12, 5, .31],
    [1580, 181, -9, -18, 4.6, 15, 6, .38],
    [1528, 244, -6, -12, 4.5, 10, 5, .22],
];

const IGNITIONS = [
    [1361, 212, .92, -.69], [1348, 194, .72, -.63],
    [1329, 171, .59, -.64], [1310, 179, .31, -.72],
    [1201, 143, .36, -.77], [1114, 87, .37, -.69],
    [851, 124, .34, -.67], [1585, 191, .32, -.37],
    [1569, 160, .25, -.43], [1464, 68, .23, -.24],
    [1528, 247, .22, -.41],
];

// Terrain points at the far depth only. The largest core is 8 px across at
// its peak. Positions avoid the kneeling titan, foreground alien and wrecks.
const BLASTS = [
    [1008, 346, .65, 18.3, 2.4],
    [1070, 375, .90, 24.7, 7.1],
    [1427, 324, .48, 28.9, 12.8],
    [1474, 350, .58, 21.1, 5.6],
    [1627, 345, .62, 31.3, 17.4],
    [940, 334, .40, 26.2, 9.3],
    [1132, 397, 1.00, 34.4, 22.8],
];

function smokeSamples(time, intensity) {
    const samples = [];
    // Intensity changes density, never the clock phase: moving the activity
    // slider must not teleport plumes. Each source has an unrelated phase.
    TRAILS.forEach((trail, group) => {
        const [x, y, vx, vy, lifetime, initialSize, count, depth] = trail;
        for (let i = 0; i < count; i++) {
            const id = 101 + group * 37 + i * 3.19;
            const phase = (i + hash(id) * .65) / count * lifetime;
            const absolute = time + phase;
            const cycle = Math.floor(absolute / lifetime);
            const u = (absolute / lifetime) - cycle;
            const age = u * lifetime;
            const seed = id + cycle * 17.3;
            const size = initialSize * (1 + age * .29) * (.82 + hash(seed + 1) * .35);
            samples.push({
                x: x + vx * age + (hash(seed + 2) - .5) * initialSize * .4,
                y: y + vy * age + (hash(seed + 3) - .5) * initialSize * .24,
                size,
                alpha: clamp(lifeFade(u) * (.57 + .27 * depth) * (.75 + intensity * .25)),
                rotation: (hash(seed + 4) - .5) * 1.2 + u * .15,
                texture: (i + group) % 3,
                group, progress: u, vx, vy,
            });
        }
    });
    return samples;
}

function fragmentSamples(time, intensity) {
    const fragments = [];
    IGNITIONS.forEach(([x, y, depth], group) => {
        // Detached embers are much smaller than the photographed ship debris.
        const count = group < 3 ? 4 : 2;
        for (let i = 0; i < count; i++) {
            const id = group * 31.3 + i * 7.17 + 414;
            const period = 3.2 + hash(id) * 4.8;
            const absolute = time + hash(id + 1) * period;
            const cycle = Math.floor(absolute / period);
            const u = absolute / period - cycle;
            const age = u * period;
            const seed = id + cycle * 43.1;
            const vx = (3 + hash(seed + 1) * 6) * depth;
            const vy = (10 + hash(seed + 2) * 10) * depth;
            const length = (2.4 + hash(seed + 3) * 3.6) * depth;
            fragments.push({
                x: x + vx * age,
                y: y + vy * age + age * age * depth * .4,
                dx: vx * .09,
                dy: length,
                width: .35 + depth * .48,
                alpha: lifeFade(u) * (.4 + hash(seed + 4) * .4) * (.65 + intensity * .19),
                depth, group, progress: u,
            });
        }
    });
    return fragments;
}

function blastSamples(time, intensity) {
    const events = [];
    if (intensity <= 0) return events;
    BLASTS.forEach(([baseX, baseY, depth, period, offset], index) => {
        const absolute = time + offset;
        const cycle = Math.floor(absolute / period);
        const age = absolute - cycle * period;
        const active = 6.2 + depth * 1.7;
        if (age > active) return;
        const seed = index * 61.3 + cycle * 17.1;
        const x = baseX + (hash(seed + 2) - .5) * 18;
        const y = baseY + (hash(seed + 3) - .5) * 3;
        const power = (.70 + hash(seed + 4) * .3) * Math.min(1.1, intensity);
        const flare = Math.exp(-age * 4.8) * smooth(age / .055) * power;
        const fire = smooth(age / .12) * Math.exp(-age * 1.05) * power;
        const radius = depth * (1.8 + Math.min(age, 1) * 2.5);
        events.push({x, y, depth, age, power, flare, fire, radius, index,
            plumeAlpha: smooth(age / .6) * smooth((active - age) / 3) * .32 * power});
    });
    return events;
}

export function createSkyEffects(assets) {
    for (const key of Object.keys(SKY_ASSET_FILES)) {
        if (!assets[key]) throw new Error(`Missing titan sky asset: ${key}`);
    }

    function getDiagnostics(time, intensity = 1) {
        time = cleanTime(time);
        intensity = cleanIntensity(intensity);
        return {
            time, intensity,
            hullTransforms: 0,
            emissionRegions: EMISSIONS.length,
            smoke: smokeSamples(time, intensity),
            fragments: fragmentSamples(time, intensity),
            explosions: blastSamples(time, intensity),
            fireOrigins: IGNITIONS.map(([x, y, depth]) => ({x, y, depth})),
        };
    }

    function render(ctx, time, intensity = 1) {
        const sample = getDiagnostics(time, intensity);
        time = sample.time;
        intensity = sample.intensity;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        // These tiles contain photographed smoke only. Replacing its texture
        // gives the original painted plumes actual continuous flow; faint
        // extra particles alone cannot animate a large static photograph.
        const flowFrames = 32, flowColumns = 8, cellW = 212, cellH = 132;
        [[945,0,205,115,0,8.0], [660,0,210,130,1,10.4]].forEach(([x,y,w,h,region,period]) => {
            const frame = (time / period % 1) * flowFrames;
            const a = Math.floor(frame), b = (a + 1) % flowFrames;
            const mix = frame-a;
            const tileY = n => (region*flowFrames/flowColumns+Math.floor(n/flowColumns))*cellH;
            ctx.globalAlpha = 1;
            ctx.drawImage(assets.flow,(a%flowColumns)*cellW,tileY(a),w,h,x,y,w,h);
            ctx.globalAlpha = mix;
            ctx.drawImage(assets.flow,(b%flowColumns)*cellW,tileY(b),w,h,x,y,w,h);
        });
        for (const puff of sample.smoke) {
            if (puff.alpha < .006 || puff.y + puff.size < 0) continue;
            ctx.save();
            ctx.globalAlpha = puff.alpha;
            ctx.translate(puff.x, puff.y);
            ctx.rotate(puff.rotation);
            ctx.drawImage(assets[`smoke${puff.texture}`], -puff.size*.5, -puff.size*.5, puff.size, puff.size);
            ctx.restore();
        }

        ctx.globalCompositeOperation = 'screen';
        for (const [x, y, w, h, phase] of EMISSIONS) {
            const pulse = .5 + .23*Math.sin(time*6.7+phase*2.1)
                + .16*Math.sin(time*11.3+phase*7.8) + .11*Math.sin(time*17.1+phase);
            ctx.globalAlpha = clamp((.13 + clamp(pulse)*.68) * (.7+intensity*.3));
            ctx.drawImage(assets.emissions, x-790, y, w, h, x, y, w, h);
        }

        IGNITIONS.forEach(([x, y, depth, angle], index) => {
            for (let i = 0; i < 3; i++) {
                const speed = 1.1 + hash(index*5.7+i)*.75;
                const u = (time * speed + i/3 + hash(index+21)) % 1;
                const alpha = clamp(lifeFade(u) * (.80 + .18*Math.sin(time*7.3+index+i)) * (.65+intensity*.35));
                const h = (20 + u*32) * depth;
                const w = (9.2 + u*4.4) * depth;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(x - u*10*depth, y - u*15*depth);
                ctx.rotate(angle + Math.sin(time*4.3+index)*.09);
                ctx.drawImage(assets.flame, -w*.5, -h, w, h);
                ctx.restore();
            }
        });

        ctx.lineCap = 'round';
        for (const fragment of sample.fragments) {
            ctx.globalAlpha = fragment.alpha;
            ctx.strokeStyle = '#ffb271';
            ctx.lineWidth = fragment.width;
            ctx.beginPath();
            ctx.moveTo(fragment.x, fragment.y);
            ctx.lineTo(fragment.x-fragment.dx, fragment.y-fragment.dy);
            ctx.stroke();
        }

        for (const blast of sample.explosions) {
            const {x, y, depth, age, radius, flare, fire, plumeAlpha} = blast;
            // Terrain illumination is horizontal and localized, not a round
            // lens flare or an expanding shockwave drawn across the scene.
            ctx.globalAlpha = flare*.20 + fire*.07;
            ctx.drawImage(assets.glow, x-depth*24, y-depth*6, depth*48, depth*11);
            ctx.globalAlpha = clamp(fire*.9 + flare*.6);
            ctx.drawImage(assets.burst, x-radius, y-radius*1.7, radius*2, radius*2);
            if (age < 1.2) {
                for (let spark = 0; spark < 4; spark++) {
                    const a = -.3 - spark*.76;
                    const distance = age * (4.5 + spark) * depth;
                    const sx = x + Math.cos(a)*distance;
                    const sy = y + Math.sin(a)*distance + age*age*2*depth;
                    ctx.globalAlpha = fire*.6;
                    ctx.fillStyle = '#ffd19b';
                    ctx.fillRect(sx, sy, .5+depth*.25, .6+depth*.45);
                }
            }
            ctx.globalCompositeOperation = 'source-over';
            const plumeSize = (4 + age*3.5) * depth;
            ctx.globalAlpha = plumeAlpha;
            ctx.drawImage(assets.smoke2, x-age*1.1*depth-plumeSize*.5,
                y-age*2.2*depth-plumeSize*.85, plumeSize, plumeSize*1.15);
            ctx.globalCompositeOperation = 'screen';
        }
        ctx.restore();
    }

    return {render, getDiagnostics};
}
