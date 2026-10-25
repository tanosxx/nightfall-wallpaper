import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SKY_ASSET_FILES, createSkyEffects} from '../extension/nightfall@local/titans-sky.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = Object.fromEntries(Object.entries(SKY_ASSET_FILES).map(([key, file]) => {
    const png = fs.readFileSync(path.join(root, 'assets', 'titans', file));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    return [key, {key, width: png.readUInt32BE(16), height: png.readUInt32BE(20)}];
}));
const sky = createSkyEffects(assets);
assert.throws(() => createSkyEffects({}), /Missing titan sky asset/);

class RecordingContext {
    constructor() {
        this.globalAlpha = .73;
        this.globalCompositeOperation = 'source-over';
        this.lineCap = 'butt';
        this.lineWidth = 7;
        this.strokeStyle = '#112233';
        this.fillStyle = '#445566';
        this.stack = [];
        this.calls = [];
    }
    state() {
        return Object.fromEntries(['globalAlpha', 'globalCompositeOperation', 'lineCap',
            'lineWidth', 'strokeStyle', 'fillStyle'].map(key => [key, this[key]]));
    }
    save() {this.stack.push(this.state()); this.calls.push(['save']);}
    restore() {Object.assign(this, this.stack.pop()); this.calls.push(['restore']);}
    record(op, args) {
        for (const n of args) if (typeof n === 'number') assert.ok(Number.isFinite(n), `${op}: ${n}`);
        assert.ok(this.globalAlpha >= 0 && this.globalAlpha <= 1, `${op}: invalid alpha ${this.globalAlpha}`);
        assert.ok(['source-over', 'screen', 'lighter'].includes(this.globalCompositeOperation));
        this.calls.push([op, ...args, this.state()]);
    }
    translate(...args) {this.record('translate', args);}
    rotate(...args) {this.record('rotate', args);}
    beginPath() {this.record('beginPath', []);}
    moveTo(...args) {this.record('moveTo', args);}
    lineTo(...args) {this.record('lineTo', args);}
    stroke() {this.record('stroke', []);}
    fillRect(...args) {this.record('fillRect', args);}
    drawImage(image, ...args) {
        assert.ok(image?.width > 0 && image?.height > 0);
        assert.ok(args.length === 4 || args.length === 8);
        if (args.length === 8) {
            const [sx, sy, sw, sh] = args;
            assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0);
            assert.ok(sx + sw <= image.width && sy + sh <= image.height,
                `${image.key}: source region escapes atlas`);
        }
        this.record('drawImage', [image.key, ...args]);
    }
}

function frame(time, intensity = 1) {
    const ctx = new RecordingContext();
    const before = ctx.state();
    sky.render(ctx, time, intensity);
    assert.deepEqual(ctx.state(), before, 'effect must restore surrounding compositor state');
    assert.equal(ctx.stack.length, 0);
    return crypto.createHash('sha256').update(JSON.stringify(ctx.calls)).digest('hex');
}

// Same time means an identical frame, irrespective of intervening calls or
// monitor paint order. Pausing therefore freezes every sky effect.
for (const time of [0, .1, .6, 1, 7, 18, 31, 60, 120, 3600, 86400]) {
    const before = frame(time);
    frame(time + 300, .4);
    assert.equal(frame(time), before);
    assert.notEqual(frame(time + 1 / 24), before, 'sky must visibly evolve over time');
    const diagnostics = sky.getDiagnostics(time);
    assert.equal(diagnostics.hullTransforms, 0);
    assert.equal(diagnostics.smoke.length, 49);
    assert.equal(diagnostics.fireOrigins.length, 11);
    for (const p of diagnostics.smoke) {
        assert.ok(p.vx < 0 && p.vy < 0, 'smoke must flow continuously up-left, never pendulum');
        assert.ok(p.y < 260, 'ship smoke may not cover foreground robot or alien');
    }
    for (const p of diagnostics.explosions) {
        assert.ok(p.y > 315 && p.y < 402);
        assert.ok(p.radius * 2 < 9, 'distant fireballs must remain perspective-correct');
    }
}
for (let i = 0; i < 400; i++) frame(i * .271, (i % 19) / 10);
assert.equal(sky.getDiagnostics(20, 0).explosions.length, 0);
assert.equal(frame(NaN, Infinity), frame(0, 1));
assert.equal(frame(-4, -1), frame(0, 0));
assert.deepEqual(
    sky.getDiagnostics(713, 0).smoke.map(({x,y}) => [x,y]),
    sky.getDiagnostics(713, 1).smoke.map(({x,y}) => [x,y]),
    'activity slider must not teleport smoke');
assert.deepEqual(
    sky.getDiagnostics(713, 0).fragments.map(({x,y}) => [x,y]),
    sky.getDiagnostics(713, 1).fragments.map(({x,y}) => [x,y]),
    'activity slider must not teleport debris');

// Between emission boundaries the plume moves only forward; a new particle
// cannot pop in because its opacity goes to zero at both life boundaries.
for (const time of [0, 3, 8, 26, 73, 120]) {
    const a = sky.getDiagnostics(time).smoke;
    const b = sky.getDiagnostics(time+.01).smoke;
    a.forEach((p, index) => {
        if (b[index].progress > p.progress) {
            assert.ok(b[index].x < p.x);
            assert.ok(b[index].y < p.y);
        } else {
            assert.ok(p.alpha < .01 && b[index].alpha < .01);
        }
    });
}
console.log('Titan sky: asset closure, atlas bounds, deterministic pause, moving trails, perspective, context isolation and invalid input checks passed.');
