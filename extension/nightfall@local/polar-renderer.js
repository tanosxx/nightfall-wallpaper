/* Polar Station: transparent Cairo animation over the original photograph. */
import Cairo from 'cairo';
import * as Data from './polar-data.js';
import {createPolarMotion} from './polar-motion.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fraction = value => value - Math.floor(value);
const smooth = value => value * value * (3 - 2 * value);

function generator(seed) {
    let state = seed === undefined ? (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 : seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function polygon(cr, points) {
    cr.newPath();
    points.forEach(([x, y], i) => {
        if (i) cr.lineTo(x * Data.IMAGE_WIDTH, y * Data.IMAGE_HEIGHT);
        else cr.moveTo(x * Data.IMAGE_WIDTH, y * Data.IMAGE_HEIGHT);
    });
    cr.closePath();
}

function waterClearance(x, y, points) {
    let inside = false, nearest = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[j], [bx, by] = points[i];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        const dx = bx - ax, dy = by - ay;
        const u = clamp(((x - ax) * dx + (y - ay) * dy) / Math.max(.001, dx * dx + dy * dy), 0, 1);
        nearest = Math.min(nearest, Math.hypot(x - ax - u * dx, y - ay - u * dy));
    }
    return inside ? nearest : 0;
}

function waterMesh(region, index) {
    const points = region.polygon;
    const x = Math.floor(Math.min(...points.map(p => p[0]))) - 1;
    const y = Math.floor(Math.min(...points.map(p => p[1]))) - 1;
    const width = Math.ceil(Math.max(...points.map(p => p[0]))) - x + 1;
    const height = Math.ceil(Math.max(...points.map(p => p[1]))) - y + 1;
    // Ripples vary faster vertically than horizontally. An anisotropic mesh
    // captures that motion while bounding the number of Cairo source transforms.
    const cols = Math.max(2, Math.ceil(width / 36)), rows = Math.max(2, Math.ceil(height / 12));
    const grid = [], vertices = [], triangles = [];
    for (let row = 0; row <= rows; row++) {
        const line = [];
        for (let col = 0; col <= cols; col++) {
            const vx = x + col * width / cols, vy = y + row * height / rows;
            const edge = smooth(clamp(waterClearance(vx, vy, points) / Math.max(12, region.feather ?? 24), 0, 1));
            const vertex = {x: vx, y: vy, sx: vx, sy: vy, edge};
            line.push(vertex); vertices.push(vertex);
        }
        grid.push(line);
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const a = grid[row][col], b = grid[row][col + 1], c = grid[row + 1][col], d = grid[row + 1][col + 1];
        for (const triangle of [[a, b, d], [a, d, c]]) if (triangle.some(v => v.edge > 0)) triangles.push(triangle);
    }
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const context = new Cairo.Context(surface); context.translate(-x, -y);
    const mask = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const p = new Cairo.Context(mask); p.translate(-x, -y);
    points.forEach(([px, py], i) => i ? p.lineTo(px, py) : p.moveTo(px, py)); p.closePath();
    p.setSourceRGBA(1, 1, 1, 1); p.fillPreserve();
    p.setOperator(Cairo.Operator.DEST_OUT); p.setSourceRGBA(0, 0, 0, .45); p.setLineWidth(3); p.stroke(); p.$dispose();
    return {index, x, y, width, height, vertices, triangles, surface, context, mask, frame: -1};
}

function waterTriangle(cr, plate, triangle) {
    const [a0, a1, a2] = triangle;
    const sx1 = a1.sx - a0.sx, sy1 = a1.sy - a0.sy, sx2 = a2.sx - a0.sx, sy2 = a2.sy - a0.sy;
    const tx1 = a1.x - a0.x, ty1 = a1.y - a0.y, tx2 = a2.x - a0.x, ty2 = a2.y - a0.y;
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < .01) return;
    const a = (tx1 * sy2 - tx2 * sy1) / det, b = (ty1 * sy2 - ty2 * sy1) / det;
    const c = (tx2 * sx1 - tx1 * sx2) / det, d = (ty2 * sx1 - ty1 * sx2) / det;
    const v = .5 * Math.atan2(2 * (a * c + b * d), a * a + b * b - c * c - d * d);
    const ux = a * Math.cos(v) + c * Math.sin(v), uy = b * Math.cos(v) + d * Math.sin(v), scale = Math.hypot(ux, uy);
    cr.save(); cr.setAntialias(Cairo.Antialias.NONE);
    cr.moveTo(a0.x, a0.y); cr.lineTo(a1.x, a1.y); cr.lineTo(a2.x, a2.y); cr.closePath(); cr.clip();
    cr.translate(a0.x - a * a0.sx - c * a0.sy, a0.y - b * a0.sx - d * a0.sy);
    cr.rotate(Math.atan2(uy, ux)); cr.scale(scale, (a * d - b * c) / scale); cr.rotate(-v);
    cr.setSourceSurface(plate, 0, 0); cr.paint(); cr.restore();
}

class PolarRenderer {
    constructor(imagePath, seed) {
        if (!imagePath) throw new Error('Polar Station needs its background image path.');
        this.motion = createPolarMotion(Data, seed);
        this.time = 0;
        this.plate = Cairo.ImageSurface.createFromPNG(imagePath);
        this.waterRegions = (Data.WATER_SURFACE ?? []).map(waterMesh);
        this.weather = 1;
        this.random = generator(seed);
        this.glows = new Map();
        this.auroraTextures = new Map();
        this.auroraFrame = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Math.ceil(Data.IMAGE_HEIGHT * .34));
        this.auroraTime = -Infinity;
        this.windows = this.motion.windows;
        this.snow = Array.from({length: Data.SNOW?.count || 220}, () => ({
            x: this.random(), y: this.random(), depth: this.random(), phase: this.random() * TAU,
            speed: .014 + this.random() * .024, drift: -.005 - this.random() * .005,
        }));
    }

    update(dt, _pointer = {}, weather = 1) {
        dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        this.weather = clamp(Number.isFinite(weather) ? weather : 1, 0, 1);
        this.motion.update(dt);
        this.time = this.motion.time;
    }

    glow(cr, x, y, radius, color, alpha) {
        if (alpha <= 0) return;
        const key = color.join(',');
        let texture = this.glows.get(key);
        if (!texture) {
            texture = new Cairo.ImageSurface(Cairo.Format.ARGB32, 64, 64);
            const p = new Cairo.Context(texture);
            const gradient = new Cairo.RadialGradient(32, 32, 0, 32, 32, 31);
            const [r, g, b] = color.map(v => v / 255);
            gradient.addColorStopRGBA(0, r, g, b, .8);
            gradient.addColorStopRGBA(.2, r, g, b, .24);
            gradient.addColorStopRGBA(1, r, g, b, 0);
            p.setSource(gradient); p.paint(); p.$dispose();
            this.glows.set(key, texture);
        }
        cr.save(); cr.translate(x, y); cr.scale(radius / 32, radius / 32);
        cr.setSourceSurface(texture, -32, -32); cr.paintWithAlpha(alpha); cr.restore();
    }

    auroraTexture(color) {
        const key = color.join(',');
        if (this.auroraTextures.has(key)) return this.auroraTextures.get(key);
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 32, 256);
        const p = new Cairo.Context(surface);
        const [r, g, b] = color.map(v => v / 255);
        const vertical = new Cairo.LinearGradient(0, 0, 0, 256);
        for (const [at, alpha] of [[0,0],[.16,.035],[.42,.24],[.70,.78],[.85,.51],[.96,.10],[1,0]])
            vertical.addColorStopRGBA(at, r, g, b, alpha);
        p.setSource(vertical); p.paint();
        const horizontal = new Cairo.LinearGradient(0, 0, 32, 0);
        for (const [at, alpha] of [[0,0],[.35,1],[.65,1],[1,0]])
            horizontal.addColorStopRGBA(at, 1, 1, 1, alpha);
        p.setOperator(Cairo.Operator.DEST_IN); p.setSource(horizontal); p.paint(); p.$dispose();
        this.auroraTextures.set(key, surface);
        return surface;
    }

    renderAurora(cr) {
        cr.save(); polygon(cr, Data.SKY_POLYGON); cr.clip();
        for (const band of Data.AURORA || []) {
            const texture = this.auroraTexture(band.color);
            const count = 132, span = (band.right - band.left) * Data.IMAGE_WIDTH;
            const stripWidth = span / count * 2.15;
            const t = this.time * band.speed;
            for (let i = 1; i < count; i++) {
                const u = i / count;
                const edge = Math.pow(Math.sin(Math.PI * u), .7);
                const x = (band.left + (band.right - band.left) * u) * Data.IMAGE_WIDTH;
                const y = (band.y + Math.sin(u * 7.7 + t + band.phase) * .019 + Math.sin(u * 15.3 - t * .63 + band.phase) * .007) * Data.IMAGE_HEIGHT;
                const height = band.height * Data.IMAGE_HEIGHT * (.72 + .18 * Math.sin(u * 10.1 + t * .38 + band.phase));
                const folds = .34 + .34 * Math.pow(Math.sin(u * 83 + t + band.phase), 2) + .32 * Math.pow(Math.sin(u * 191 - t * .43), 2);
                const pulse = .84 + .16 * Math.sin(this.time * .19 + band.phase);
                // Every fold has its own vertical and horizontal feather.
                // Overlap creates a soft curtain without a hard top/bottom rail.
                cr.save(); cr.translate(x - stripWidth / 2, y - height);
                cr.scale(stripWidth / 32, height / 256);
                cr.rectangle(0, 0, 32, 256); cr.clip();
                cr.setSourceSurface(texture, 0, 0);
                cr.paintWithAlpha(band.opacity * edge * folds * pulse);
                cr.restore();
            }
        }
        cr.restore();
    }

    drawAurora(cr) {
        // These distant curtains travel less than one pixel in 80 ms. Updating
        // this soft layer at 12 Hz keeps snow and windows at the full 24 Hz.
        if (this.time - this.auroraTime >= .08) {
            const p = new Cairo.Context(this.auroraFrame);
            p.setOperator(Cairo.Operator.CLEAR); p.paint(); p.setOperator(Cairo.Operator.OVER);
            this.renderAurora(p); p.$dispose();
            this.auroraTime = this.time;
        }
        cr.save(); cr.rectangle(0, 0, Data.IMAGE_WIDTH, Math.ceil(Data.IMAGE_HEIGHT * .34)); cr.clip();
        cr.setSourceSurface(this.auroraFrame, 0, 0); cr.paint(); cr.restore();
    }

    drawWindows(cr) {
        (Data.WINDOWS || []).forEach((window, index) => {
            const off = (1 - this.windows[index].value) * (1 - (window.minLight ?? 0));
            if (off < .005) return;
            const x = window.x * Data.IMAGE_WIDTH, y = window.y * Data.IMAGE_HEIGHT;
            const [r, g, b] = (window.offColor || [22, 35, 49]).map(v => v / 255);
            cr.setSourceRGBA(r, g, b, off);
            for (const [dx, dy, w, h] of window.maskRects || [[-window.w / 2, -window.h / 2, window.w, window.h]])
                cr.rectangle(x + dx, y + dy, w, h);
            cr.fill();
        });
    }

    drawWater(cr) {
        const frame = Math.floor(this.time * 12);
        for (const region of this.waterRegions) {
            if (region.frame !== frame) {
                const p = region.context;
                p.setSourceSurface(this.plate, 0, 0); p.paint();
                for (const vertex of region.vertices) {
                    const [dx, dy] = this.motion.waterDisplacement(vertex.x, vertex.y, region.index);
                    vertex.sx = vertex.x + dx * vertex.edge;
                    vertex.sy = vertex.y + dy * vertex.edge;
                }
                for (const triangle of region.triangles) waterTriangle(p, this.plate, triangle);
                region.frame = frame;
            }
            cr.save(); cr.rectangle(region.x, region.y, region.width, region.height); cr.clip();
            cr.setSourceSurface(region.surface, region.x, region.y); cr.maskSurface(region.mask, region.x, region.y); cr.restore();
        }
    }

    drawStars(cr) {
        (Data.STARS ?? []).forEach((star, index) => {
            const gain = this.motion.starBrightness(index);
            const background = star.backgroundColor ?? [19, 34, 50];
            if (star.originalPixels?.length) {
                for (const [dx, dy, r, g, b] of star.originalPixels) {
                    const color = [r, g, b].map((value, i) => clamp(background[i] + (value - background[i]) * gain, 0, 255) / 255);
                    cr.setSourceRGB(...color); cr.rectangle(star.x + dx, star.y + dy, 1, 1); cr.fill();
                }
            } else {
                const color = gain < 1 ? background : (star.color ?? [208, 224, 236]);
                cr.setSourceRGBA(...color.map(v => v / 255), Math.abs(gain - 1) * .65);
                cr.arc(star.x, star.y, star.radius ?? .8, 0, TAU); cr.fill();
            }
        });
    }

    drawBeacons(cr) {
        (Data.BEACONS ?? []).forEach((beacon, index) => {
            const pulse = this.motion.beaconBrightness(index);
            const x = beacon.x, y = beacon.y;
            const off = (beacon.offColor ?? [20, 31, 43]).map(v => v / 255);
            cr.setSourceRGBA(...off, (1 - pulse) * .98);
            for (const [dx, dy, w, h] of beacon.maskRects ?? [[-1, -1, 2, 2]]) cr.rectangle(x + dx, y + dy, w, h);
            cr.fill();
            const color = beacon.color ?? [255, 55, 36];
            const addedLight = pulse * (beacon.strength ?? 1);
            this.glow(cr, x, y, beacon.haloRadius ?? 9, color, addedLight * .8);
            cr.setSourceRGBA(...color.map(v => v / 255), addedLight);
            cr.arc(x, y, beacon.coreRadius ?? 1, 0, TAU); cr.fill();
        });
    }

    drawPeople(cr) {
        const people = [...this.motion.people].sort((a, b) => a.y - b.y);
        for (const person of people) {
            const h = person.height, face = person.face;
            const swing = person.walking ? Math.sin(person.stride) : 0;
            const bob = person.walking ? Math.abs(Math.sin(person.stride)) * h * .025 : 0;
            const work = person.working ? Math.sin(this.time * 2.5 + person.routeIndex) : 0;
            const lean = person.working ? face * h * .10 : 0;
            const color = person.color.map(v => v / 255);
            cr.save(); cr.translate(person.x, person.y - bob);
            cr.save(); cr.scale(1, .22); cr.setSourceRGBA(.02, .04, .06, .22); cr.arc(0, 0, h * .3, 0, TAU); cr.fill(); cr.restore();
            cr.setLineCap(Cairo.LineCap.ROUND); cr.setLineJoin(Cairo.LineJoin.ROUND);
            cr.setSourceRGBA(.045, .065, .085, .96); cr.setLineWidth(Math.max(.65, h * .085));
            for (const side of [-1, 1]) {
                cr.moveTo(side * h * .055, -h * .37);
                cr.lineTo(side * h * .06 + swing * side * h * .075, -h * .17);
                cr.lineTo(side * h * .07 - swing * side * h * .13, 0);
            }
            cr.stroke();
            cr.setSourceRGBA(...color, .98);
            cr.moveTo(lean - h * .12, -h * .76); cr.lineTo(lean + h * .12, -h * .76);
            cr.lineTo(h * .14, -h * .34); cr.lineTo(-h * .14, -h * .34); cr.closePath(); cr.fill();
            cr.setLineWidth(Math.max(.7, h * .075));
            for (const side of [-1, 1]) {
                const handX = person.working ? face * h * (.25 + work * .035) : side * h * .16 + swing * side * h * .1;
                const handY = person.working ? -h * (.42 + work * .055) : person.action === 'inspect' && side === face ? -h * .64 : -h * .39;
                cr.moveTo(lean + side * h * .10, -h * .70); cr.lineTo(handX, handY); cr.stroke();
            }
            cr.setSourceRGBA(.055, .075, .095, .98); cr.arc(lean, -h * .87, h * .115, 0, TAU); cr.fill();
            cr.setSourceRGBA(.54, .44, .34, .65); cr.rectangle(lean + face * h * .055 - h * .025, -h * .89, h * .05, h * .08); cr.fill();
            if (person.working) {
                cr.setSourceRGBA(.30, .36, .39, .8); cr.setLineWidth(.55);
                cr.moveTo(face * h * (.25 + work * .035), -h * (.42 + work * .055));
                cr.lineTo(face * h * .37, -h * .06); cr.stroke();
            } else if (person.action === 'inspect') {
                cr.setSourceRGBA(.71, .59, .34, .55); cr.rectangle(face * h * .15, -h * .66, h * .065, h * .1); cr.fill();
            }
            cr.restore();
        }
    }

    drawAirship(cr, ship) {
        const phase = fraction(this.time / ship.period + ship.phase);
        const progress = ship.direction > 0 ? phase : 1 - phase;
        const alpha = Math.min(1, phase / .08, (1 - phase) / .08);
        const x = (ship.left + (ship.right - ship.left) * progress) * Data.IMAGE_WIDTH;
        const y = (ship.y + Math.sin(this.time * .13 + ship.phase) * .0025) * Data.IMAGE_HEIGHT;
        cr.save(); cr.translate(x, y); cr.scale(ship.width * ship.direction, ship.width);
        cr.setSourceRGBA(.08, .16, .22, .9 * alpha);
        cr.moveTo(-.48, 0); cr.curveTo(-.45, -.14, .30, -.16, .50, -.015);
        cr.curveTo(.35, .12, -.36, .13, -.48, 0); cr.closePath(); cr.fill();
        cr.setSourceRGBA(.26, .40, .47, .46 * alpha);
        cr.setLineWidth(.012); cr.moveTo(-.40, -.025); cr.curveTo(-.18, -.105, .25, -.09, .43, -.018); cr.stroke();
        cr.setSourceRGBA(.06, .12, .18, .94 * alpha);
        cr.moveTo(-.35, -.055); cr.lineTo(-.48, -.20); cr.lineTo(-.25, -.075); cr.closePath(); cr.fill();
        cr.moveTo(-.36, .045); cr.lineTo(-.48, .17); cr.lineTo(-.22, .07); cr.closePath(); cr.fill();
        cr.rectangle(-.08, .075, .20, .045); cr.fill();
        cr.setSourceRGBA(1, .68, .32, .85 * alpha); cr.rectangle(.01, .088, .045, .012); cr.fill();
        const blink = .35 + .65 * Math.pow(Math.max(0, Math.sin(this.time * 1.5 + ship.phase)), 10);
        cr.setSourceRGBA(.9, .39, .22, blink * alpha); cr.arc(-.44, -.008, .012, 0, TAU); cr.fill();
        cr.restore();
        this.glow(cr, x + ship.width * .04 * ship.direction, y + ship.width * .1, ship.width * .12, [255, 188, 110], .18 * alpha);
    }

    drawSnow(cr, width, height) {
        const count = Math.round(this.snow.length * this.weather);
        const scale = Math.max(.7, height / 941);
        for (let layer = 0; layer < 3; layer++) {
            cr.newPath();
            for (let i = 0; i < count; i++) {
                const flake = this.snow[i];
                if (Math.min(2, Math.floor(flake.depth * 3)) !== layer) continue;
                const speed = flake.speed * (.55 + flake.depth * 1.3);
                const x = fraction(flake.x + this.time * flake.drift + Math.sin(this.time * .23 + flake.phase) * .007) * (width + 20) - 10;
                const y = fraction(flake.y + this.time * speed) * (height + 20) - 10;
                const radius = (.42 + flake.depth * .72) * scale;
                cr.moveTo(x + radius, y); cr.arc(x, y, radius, 0, TAU);
            }
            cr.setSourceRGBA(.79, .87, .93, .20 + layer * .12); cr.fill();
        }
    }

    paint(cr, width, height) {
        cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
        const scale = Math.max(width / Data.IMAGE_WIDTH, height / Data.IMAGE_HEIGHT);
        cr.save(); cr.translate((width - Data.IMAGE_WIDTH * scale) / 2, (height - Data.IMAGE_HEIGHT * scale) / 2); cr.scale(scale, scale);
        this.drawWater(cr); this.drawStars(cr); this.drawAurora(cr); this.drawWindows(cr);
        this.drawBeacons(cr); this.drawPeople(cr);
        for (const ship of Data.AIRSHIPS || []) this.drawAirship(cr, ship);
        cr.restore(); this.drawSnow(cr, width, height);
    }

    destroy() {
        this.plate.finish();
        for (const region of this.waterRegions) {
            region.context.$dispose(); region.surface.finish(); region.mask.finish();
        }
        this.waterRegions = [];
        for (const texture of this.glows.values()) texture.finish();
        for (const texture of this.auroraTextures.values()) texture.finish();
        this.auroraTextures.clear();
        this.auroraFrame.finish();
        this.glows.clear(); this.snow = []; this.windows = [];
    }
}

export function createPolarRenderer(imagePath, seed) { return new PolarRenderer(imagePath, seed); }
