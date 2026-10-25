/* Native Cairo rendition of the approved Abyss photograph and animation.
 * Light is reconstructed from positive source-image radiance, never black cones.
 * All motion samples scene clocks, and every cached surface is released on exit.
 */
import Cairo from 'cairo';
import {Model as Water} from './abyss-water-model.js';
import {Model as Lighting} from './abyss-lighting-model.js';
import {Model as Practicals} from './abyss-practicals-model.js';
import {Model as Elevator} from './abyss-elevator-model.js';
import {Model as Interior, drawPerson as drawResident} from './abyss-interior-model.js';
import {Model as Transit, drawPerson as drawWalker} from './abyss-transit-model.js';
import {EMITTERS} from './abyss-radiance-data.js';

const W = 1672, H = 941, TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function polygon(cr, points) {
    points.forEach(([x, y], i) => i ? cr.lineTo(x, y) : cr.moveTo(x, y));
    cr.closePath();
}
function clear(cr) {
    cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
}
function ellipse(cr, x, y, rx, ry, rotation = 0) {
    cr.save(); cr.translate(x, y); cr.rotate(rotation); cr.scale(rx, ry);
    cr.arc(0, 0, 1, 0, TAU); cr.restore();
}

// Narrow path adapter lets the native version reuse the exact approved distant
// silhouette geometry, including seated gestures, without maintaining two poses.
class FigureCanvas {
    constructor(cr) { this.cr = cr; this.globalAlpha = 1; this.fillStyle = '#000000'; this.stack = []; this.x = this.y = 0; }
    save() { this.cr.save(); this.stack.push([this.globalAlpha, this.fillStyle, this.x, this.y]); }
    restore() { this.cr.restore(); [this.globalAlpha, this.fillStyle, this.x, this.y] = this.stack.pop(); }
    translate(x, y) { this.cr.translate(x, y); }
    scale(x, y) { this.cr.scale(x, y); }
    rotate(a) { this.cr.rotate(a); }
    beginPath() { this.cr.newPath(); }
    closePath() { this.cr.closePath(); }
    moveTo(x, y) { this.cr.moveTo(x, y); this.x = x; this.y = y; }
    lineTo(x, y) { this.cr.lineTo(x, y); this.x = x; this.y = y; }
    quadraticCurveTo(cx, cy, x, y) {
        this.cr.curveTo(this.x + (cx - this.x) * 2 / 3, this.y + (cy - this.y) * 2 / 3,
            x + (cx - x) * 2 / 3, y + (cy - y) * 2 / 3, x, y);
        this.x = x; this.y = y;
    }
    ellipse(x, y, rx, ry, rotation) { ellipse(this.cr, x, y, rx, ry, rotation); }
    fill() {
        const n = Number.parseInt(this.fillStyle.slice(1), 16);
        this.cr.setSourceRGBA(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, this.globalAlpha);
        this.cr.fill();
    }
    fillRect(x, y, w, h) { this.cr.newPath(); this.cr.rectangle(x, y, w, h); this.fill(); }
}

class AbyssRenderer {
    constructor(imagePath) {
        if (!imagePath) throw new Error('Abyss requires its background image path.');
        this.time = 0; this.waterTime = 0; this.weather = .7; this.destroyed = false;
        this.surfaces = []; this.contexts = []; this.glows = new Map();
        const directory = imagePath.slice(0, imagePath.lastIndexOf('/')) + '/abyss-native/';
        const load = file => { const surface = Cairo.ImageSurface.createFromPNG(file); this.surfaces.push(surface); return surface; };
        const layer = (w, h) => {
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h), cr = new Cairo.Context(surface);
            this.surfaces.push(surface); this.contexts.push(cr); return {surface, cr};
        };
        try {
            this.photo = load(imagePath); this.ambient = load(directory + 'ambient.png');
            this.emitters = EMITTERS.map(e => ({...e, surface: load(directory + e.file)}));
            this.waterMask = load(directory + 'water-mask.png'); this.shaftAmbient = load(directory + 'elevator-ambient.png');
            this.lightFrame = layer(W, H); this.scratch = layer(W, H);
            this.interior = {...layer(Interior.bounds.w, Interior.bounds.h), mask: load(directory + 'interior-mask.png')};
            this.transit = Transit.bridges.map((bridge, i) => ({...layer(bridge.bounds.w, bridge.bounds.h), bridge,
                mask: load(directory + `transit-${i}-mask.png`)}));
        } catch (error) { this.destroy(); throw error; }
    }

    update(dt, _pointer = {}, weather = 1) {
        if (this.destroyed) return;
        const step = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        this.weather = clamp(Number.isFinite(weather) ? weather : 1);
        this.time += step; this.waterTime += step * (.35 + this.weather * 1.15);
    }

    glow(cr, x, y, radius, rgb, alpha) {
        if (alpha <= 0) return;
        const key = rgb.join(',');
        if (!this.glows.has(key)) {
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 64, 64), p = new Cairo.Context(surface);
            const g = new Cairo.RadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStopRGBA(0, ...rgb, .5); g.addColorStopRGBA(.3, ...rgb, .12); g.addColorStopRGBA(1, ...rgb, 0);
            p.setSource(g); p.paint(); p.$dispose(); this.surfaces.push(surface); this.glows.set(key, surface);
        }
        cr.save(); cr.translate(x - radius, y - radius); cr.scale(radius / 32, radius / 32);
        cr.setSourceSurface(this.glows.get(key), 0, 0); cr.paintWithAlpha(alpha); cr.restore();
    }

    drawLighting(cr) {
        const p = this.lightFrame.cr, state = Lighting.sample(this.time), amber = Practicals.sample(this.time);
        p.setOperator(Cairo.Operator.SOURCE); p.setSourceSurface(this.ambient, 0, 0); p.paint();
        p.setOperator(Cairo.Operator.ADD);
        for (const e of this.emitters) {
            const power = e.kind === 'amber' ? amber[e.index]
                : e.kind === 'beacons' ? state.beacons[e.index] : 1 - state[e.kind][e.index];
            if (power <= .0001) continue;
            p.setSourceSurface(e.surface, e.x, e.y); p.paintWithAlpha(clamp(power));
        }
        p.setOperator(Cairo.Operator.OVER);
        cr.setSourceSurface(this.lightFrame.surface, 0, 0); cr.paint();
    }

    drawRefraction(cr) {
        const p = this.scratch.cr, t = this.waterTime;
        clear(p);
        // The original open-water mask is eroded and feathered. Structures and
        // their reflections never share the moving bands.
        for (let y = 0; y < H; y += 14) {
            const dx = Math.sin(y * .013 - t * .27) * 1.6 + Math.cos(y * .026 - t * .15) * .65;
            p.save(); p.rectangle(0, y, W, Math.min(14, H - y)); p.clip();
            p.setSourceSurface(this.lightFrame.surface, dx, 0); p.paint(); p.restore();
        }
        cr.setSourceSurface(this.scratch.surface, 0, 0); cr.maskSurface(this.waterMask, 0, 0);
    }

    drawElevator(cr) {
        const s = Elevator.sample(this.time);
        cr.save(); cr.setSourceSurface(this.shaftAmbient, 619, 462); cr.paint(); cr.newPath();
        Elevator.glass.forEach(points => polygon(cr, points)); cr.clip();
        const halo = new Cairo.RadialGradient(s.x, s.y, 1, s.x, s.y, 26);
        halo.addColorStopRGBA(0, 1, 185 / 255, 83 / 255, .48);
        halo.addColorStopRGBA(.35, 245 / 255, 163 / 255, 61 / 255, .19);
        halo.addColorStopRGBA(1, 240 / 255, 154 / 255, 56 / 255, 0);
        cr.setSource(halo); cr.rectangle(s.x - 27, s.y - 27, 54, 54); cr.fill();
        const cabin = new Cairo.LinearGradient(0, s.y - s.height / 2, 0, s.y + s.height / 2);
        for (const [at, rgb, a] of [[0,[255,219,151],0],[.2,[255,208,126],.7],[.72,[255,186,84],.56],[1,[255,196,111],0]])
            cabin.addColorStopRGBA(at, ...rgb.map(v => v / 255), a);
        cr.setSource(cabin); cr.rectangle(s.x - s.width / 2, s.y - s.height / 2, s.width, s.height); cr.fill();
        cr.setSourceRGBA(1, 233 / 255, 184 / 255, .65 + s.door * .24);
        cr.rectangle(s.x - s.width / 2, s.y - s.height * .3, s.width, 1.1); cr.fill();
        for (const y of Elevator.bars) {
            cr.save(); cr.rectangle(619, y, 37, 1.8); cr.clip(); cr.setSourceSurface(this.photo, 0, 0); cr.paint(); cr.restore();
        }
        cr.restore();
    }

    drawInterior(cr) {
        const layer = this.interior, p = layer.cr, b = Interior.bounds, state = Interior.sample(this.time);
        clear(p); p.save(); p.translate(-b.x, -b.y);
        const figures = new FigureCanvas(p);
        [...state.people].sort((a, b) => a.y - b.y).forEach(figure => drawResident(figures, figure));
        Interior.monitors.forEach((monitor, i) => {
            this.glow(p, monitor.x, monitor.y, 5.5, [175 / 255, 210 / 255, 189 / 255], state.monitorPower[i]);
            p.setSourceRGBA(166 / 255, 195 / 255, 178 / 255, state.monitorPower[i]);
            p.rectangle(monitor.x - monitor.rx * .7, monitor.y - monitor.ry + state.monitorScan[i] * monitor.ry * 2, monitor.rx * 1.4, .4); p.fill();
        });
        p.restore(); cr.setSourceSurface(layer.surface, b.x, b.y); cr.maskSurface(layer.mask, b.x, b.y);
    }

    drawTransit(cr) {
        const people = Transit.sample(this.time);
        this.transit.forEach((layer, i) => {
            const b = layer.bridge.bounds, p = layer.cr;
            clear(p); p.save(); p.translate(-b.x, -b.y); drawWalker(new FigureCanvas(p), people[i]); p.restore();
            cr.setSourceSurface(layer.surface, b.x, b.y); cr.maskSurface(layer.mask, b.x, b.y);
        });
    }

    grain(cr, particle) {
        if (particle.alpha < .01) return;
        if (particle.near) this.glow(cr, particle.x, particle.y, particle.radius * 4, [160 / 255, 218 / 255, 221 / 255], particle.alpha);
        cr.setSourceRGBA(...(particle.near ? [187,218,216] : [143,186,197]).map(v => v / 255), particle.alpha);
        cr.newPath(); ellipse(cr, particle.x, particle.y, particle.radius, particle.radius * .72, -.3); cr.fill();
    }

    drawParticles(cr) {
        const p = this.scratch.cr; clear(p);
        for (let i = 0; i < 154; i++) this.grain(p, Water.particleAt(i, this.waterTime));
        cr.setSourceSurface(this.scratch.surface, 0, 0); cr.maskSurface(this.waterMask, 0, 0);
        for (let i = 154; i < Water.grains.length; i++) this.grain(cr, Water.particleAt(i, this.waterTime));
        for (let i = 0; i < 39; i++) {
            const b = Water.bubbleAt(i, this.waterTime);
            cr.setSourceRGBA(179 / 255, 223 / 255, 225 / 255, b.alpha * (.45 + .55 * this.weather)); cr.setLineWidth(.45);
            cr.newPath(); ellipse(cr, b.x, b.y, b.radius, b.radius * 1.16); cr.stroke();
            cr.setSourceRGBA(215 / 255, 244 / 255, 242 / 255, b.alpha * .85);
            cr.arc(b.x - b.radius * .3, b.y - b.radius * .6, .28, 0, TAU); cr.fill();
        }
    }

    paint(cr, width, height) {
        clear(cr);
        if (this.destroyed || width <= 0 || height <= 0) return;
        const scale = Math.max(width / W, height / H);
        cr.save(); cr.translate((width - W * scale) / 2, (height - H * scale) / 2); cr.scale(scale, scale);
        this.drawLighting(cr); this.drawRefraction(cr); this.drawElevator(cr);
        this.drawInterior(cr); this.drawTransit(cr); this.drawParticles(cr); cr.restore();
    }

    getDiagnostics() {
        return {scene: 'abyss', native: true, time: this.time, waterTime: this.waterTime, weather: this.weather,
            emitters: this.emitters?.length ?? 0, residents: Interior.routines.length, passages: Transit.bridges.length,
            lightModel: 'positive-source-radiance', destroyed: this.destroyed};
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const cr of this.contexts) cr.$dispose();
        for (const surface of this.surfaces) surface.finish();
        this.contexts = []; this.surfaces = []; this.emitters = []; this.transit = []; this.glows.clear();
    }
}

export function createAbyssRenderer(imagePath) { return new AbyssRenderer(imagePath); }
