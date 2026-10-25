import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context = {window: {}, document: {createElement() {throw new Error('Pure sampling must not create canvases');}}};
vm.runInNewContext(await readFile(new URL('../station-space.js', import.meta.url), 'utf8'), context);
const {sample, particles, extraForeground} = context.window.STATION_SPACE;
const data = JSON.parse(await readFile(new URL('../station-data.json', import.meta.url), 'utf8'));
const W = 1672, H = 941;
assert.equal(particles.length, 140);
assert.equal(particles.filter(p => p.near).length, 56);
assert.equal(particles.filter(p => !p.near).length, 84);
const start = sample(0), later = sample(10), speedRanges = {far: [Infinity, 0], near: [Infinity, 0]};
for (let i = 0; i < particles.length; i++) {
    const p = particles[i], speed = Math.hypot(p.vx, p.vy), range = speedRanges[p.near ? 'near' : 'far'];
    range[0] = Math.min(range[0], speed); range[1] = Math.max(range[1], speed);
    assert(p.vx < 0, 'Dust always drifts in one direction');
    assert(Math.abs(p.vy) < speed * .25, 'No falling snow or rain');
    assert(speed >= (p.near ? 3.5 : .6) && speed <= (p.near ? 7.5 : 1.4));
    assert(p.alpha >= (p.near ? .56 : .24) && p.alpha <= (p.near ? .82 : .47));
    let dx = later[i].x - start[i].x, dy = later[i].y - start[i].y;
    if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
    assert(Math.abs(dx - p.vx * 10) < 1e-9 && Math.abs(dy - p.vy * 10) < 1e-9);
    // The coordinate wraps, but the disappearing grain is fully transparent.
    const wrapTime = p.x / -p.vx;
    for (const delta of [-.005, 0, .005]) {
        const edge = sample(wrapTime + delta)[i];
        assert(edge.alpha < .00001 && edge.flash < .00002, 'No popping at the wrap boundary');
    }
}
assert(speedRanges.near[0] > speedRanges.far[1] * 2, 'Depth groups have visibly different speeds');
let flashedFrames = 0, maxFlash = 0;
for (let frame = 0; frame <= 480; frame++) {
    const t = frame / 24, current = sample(t);
    assert.equal(JSON.stringify(current), JSON.stringify(sample(t)), 'Sampling and paused rendering are deterministic');
    const flashes = current.filter(p => p.flash > 0);
    assert(flashes.length <= 1, 'Only one occasional specular glint, no field of blinking stars');
    if (flashes.length) flashedFrames++;
    for (const p of current) {
        assert([p.x, p.y, p.alpha, p.flash].every(Number.isFinite));
        assert(p.x >= 0 && p.x < W && p.y >= 0 && p.y < H);
        assert(p.alpha >= 0 && p.alpha <= .82 && p.flash >= 0 && p.flash <= 1);
        maxFlash = Math.max(maxFlash, p.flash);
    }
}
assert(flashedFrames > 60 && flashedFrames < 220);
assert(maxFlash > .9);
const paused = JSON.stringify(sample(7.125));
sample(10000); sample(0); sample(7.124);
assert.equal(JSON.stringify(sample(7.125)), paused, 'Sample order never advances hidden clocks');

function inside(x, y, points) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [a, b] = points[i], [c, d] = points[j];
        if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
    }
    return hit;
}
function edgeDistance(x, y, points) {
    let distance = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [a, b] = points[i], [c, d] = points[j];
        const u = Math.max(0, Math.min(1, ((x - a) * (c - a) + (y - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2)));
        distance = Math.min(distance, Math.hypot(x - a - u * (c - a), y - b - u * (d - b)));
    }
    return distance;
}
// Conservative geometry check for the narrow preview. The browser harness
// additionally checks the actual raster mask and final photo contrast.
function foreground(x, y) {
    for (const piece of data.HULL_MASK) {
        if (inside(x, y, piece.polygon) && !(piece.holes || []).some(hole => inside(x, y, hole))) return true;
        if (edgeDistance(x, y, piece.polygon) < 17 || (piece.holes || []).some(hole => edgeDistance(x, y, hole) < 17)) return true;
    }
    for (const polygon of extraForeground) if (inside(x, y, polygon) || edgeDistance(x, y, polygon) < 17) return true;
    return data.BEACONS.some(beacon => Math.abs(x - beacon.x) < 11 && y > beacon.y - 46 && y < beacon.y + 54);
}
const visibleTop = p => p.near && p.x >= 344 && p.x <= 1328 && p.y >= 0 && p.y <= 230 && p.alpha >= .5 && !foreground(p.x, p.y);
const startVisible = start.map((p, i) => visibleTop(p) ? i : -1).filter(i => i >= 0), three = sample(3);
const readableMotion = startVisible.filter(i => visibleTop(three[i]) && Math.hypot(three[i].x - start[i].x, three[i].y - start[i].y) >= 10);
assert(startVisible.length >= 8, 'At least eight bright near grains must be unoccluded in the actual preview crop');
assert(readableMotion.length >= 6, 'At least six visible grains must move ten source pixels within three seconds');
let visibleFlashFrames = 0;
for (let frame = 0; frame < 96; frame++) if (sample(frame / 24).some(p => visibleTop(p) && p.flash > .25)) visibleFlashFrames++;
assert(visibleFlashFrames > 0, 'The first four seconds must contain a visible unoccluded glint');
console.log(JSON.stringify({seconds: 20, farParticles: 84, nearParticles: 56, speedRanges, flashedFrames, maxFlash,
    narrowPreview: {visibleNearAtStart: startVisible.length, movingTenPixelsInThreeSeconds: readableMotion.length, visibleFlashFramesInFourSeconds: visibleFlashFrames}}));
console.log('PASS: depth motion, pause, transparent wraps, and visible movement/glints in the narrow preview.');
