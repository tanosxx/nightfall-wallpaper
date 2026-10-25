import Cairo from 'cairo';
import * as SceneData from './scene-data.js';
import {createSimulation} from './simulation.js';

const {IMAGE_WIDTH, IMAGE_HEIGHT, SKY_POLYGON, LIGHTS, TRAFFIC, REFLECTIONS, SEARCHLIGHTS} = SceneData;

const TAU = Math.PI * 2;

function fraction(value) {
    return value - Math.floor(value);
}

function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function createRain() {
    const random = randomGenerator(72819);
    return [
        {count: 135, alpha: 0.12, width: 0.55, length: 8, speed: 0.33},
        {count: 100, alpha: 0.19, width: 0.8, length: 17, speed: 0.50},
        {count: 48, alpha: 0.25, width: 1.0, length: 30, speed: 0.72},
    ].map(layer => ({
        ...layer,
        drops: Array.from({length: layer.count}, () => ({
            x: random(), y: random(), variation: 0.78 + random() * 0.44,
        })),
    }));
}

const SHIPS = [
    {left: 0.18, right: 0.69, y: 0.155, period: 105, phase: 0.26, width: 35, direction: 1},
    {left: 0.31, right: 0.67, y: 0.222, period: 82, phase: 0.70, width: 20, direction: -1},
    {left: 0.32, right: 0.66, y: 0.277, period: 130, phase: 0.08, width: 13, direction: 1},
];

function drawShip(cr, ship, time, width, height) {
    // Use the same cover transform as the picture, so ships stay in the sky
    // on ultrawide and portrait monitors as well as a 16:9 screen.
    const scale = Math.max(width / IMAGE_WIDTH, height / IMAGE_HEIGHT);
    const imageWidth = IMAGE_WIDTH * scale;
    const imageHeight = IMAGE_HEIGHT * scale;
    const offsetX = (width - imageWidth) / 2;
    const offsetY = (height - imageHeight) / 2;
    const phase = fraction(time / ship.period + ship.phase);
    const progress = ship.direction > 0 ? phase : 1 - phase;
    const fade = Math.min(1, phase / 0.07, (1 - phase) / 0.07);
    const x = offsetX + imageWidth * (ship.left + (ship.right - ship.left) * progress);
    const y = offsetY + imageHeight * (ship.y + Math.sin(time * 0.12 + ship.phase * TAU) * 0.0015);

    cr.save();
    cr.translate(x, y);
    cr.scale(ship.width * imageWidth / 1920, ship.width * imageWidth / 1920);

    // Small atmospheric glow, kept deliberately dim at this distance.
    cr.setSourceRGBA(0.28, 0.68, 0.81, 0.025 * fade);
    cr.arc(-0.25 * ship.direction, 0.04, 0.8, 0, TAU);
    cr.fill();

    cr.setSourceRGBA(0.025, 0.055, 0.075, 0.86 * fade);
    cr.moveTo(-0.52, 0.015);
    cr.lineTo(-0.28, -0.09);
    cr.lineTo(-0.13, -0.1);
    cr.lineTo(-0.06, -0.18);
    cr.lineTo(0.13, -0.18);
    cr.lineTo(0.21, -0.1);
    cr.lineTo(0.41, -0.045);
    cr.lineTo(0.56, 0.025);
    cr.lineTo(0.24, 0.105);
    cr.lineTo(-0.31, 0.09);
    cr.closePath();
    cr.fill();

    cr.setLineWidth(0.026);
    cr.setSourceRGBA(0.48, 0.65, 0.70, 0.35 * fade);
    cr.moveTo(-0.37, -0.03);
    cr.lineTo(-0.17, -0.09);
    cr.lineTo(0.2, -0.09);
    cr.lineTo(0.4, -0.025);
    cr.stroke();

    const engineX = -0.40 * ship.direction;
    cr.setSourceRGBA(0.22, 0.85, 1.0, 0.12 * fade);
    cr.arc(engineX, 0.045, 0.11, 0, TAU);
    cr.fill();
    cr.setSourceRGBA(0.56, 0.93, 1.0, 0.83 * fade);
    cr.arc(engineX, 0.045, 0.035, 0, TAU);
    cr.fill();

    const beacon = 0.3 + Math.pow(Math.max(0, Math.sin(time * 2.4 + ship.phase * TAU)), 12) * 0.7;
    cr.setSourceRGBA(1.0, 0.47, 0.17, beacon * fade);
    cr.arc(0.30 * ship.direction, 0.025, 0.025, 0, TAU);
    cr.fill();
    cr.restore();
}

function makeRoute(route) {
    const points = route.points.map(([x, y]) => [x * IMAGE_WIDTH, y * IMAGE_HEIGHT]);
    const distances = [0];
    for (let i = 1; i < points.length; i++)
        distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return {...route, points, distances, length: distances[distances.length - 1]};
}

function routePoint(route, phase) {
    const distance = Math.max(0, Math.min(1, phase)) * route.length;
    for (let i = 1; i < route.points.length; i++) {
        if (distance <= route.distances[i]) {
            const interval = route.distances[i] - route.distances[i - 1];
            const mix = interval > 0 ? (distance - route.distances[i - 1]) / interval : 0;
            const [ax, ay] = route.points[i - 1];
            const [bx, by] = route.points[i];
            return [ax + (bx - ax) * mix, ay + (by - ay) * mix];
        }
    }
    return route.points[route.points.length - 1];
}

function skyClip(cr) {
    cr.newPath();
    SKY_POLYGON.forEach(([x, y], index) => {
        if (index === 0)
            cr.moveTo(x * IMAGE_WIDTH, y * IMAGE_HEIGHT);
        else
            cr.lineTo(x * IMAGE_WIDTH, y * IMAGE_HEIGHT);
    });
    cr.closePath();
    cr.clip();
}

function createSkyMask() {
    const mask = new Cairo.ImageSurface(Cairo.Format.ARGB32, IMAGE_WIDTH, IMAGE_HEIGHT);
    const cr = new Cairo.Context(mask);
    skyClip(cr);
    cr.setSourceRGBA(1, 1, 1, 1);
    cr.paint();
    cr.setOperator(Cairo.Operator.DEST_OUT);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);
    let previous = 1;
    for (let distance = 40; distance >= 1; distance--) {
        const ratio = (distance - 1) / 40;
        const desired = ratio * ratio * (3 - 2 * ratio);
        const alpha = 1 - desired / previous;
        previous = desired;
        const width = distance * 2;
        cr.newPath();
        SKY_POLYGON.forEach(([ax, ay], index) => {
            const [bx, by] = SKY_POLYGON[(index + 1) % SKY_POLYGON.length];
            if ((ay === 0 && by === 0) || (ax === 1 && bx === 1) || (ax === 0 && bx === 0))
                return;
            cr.moveTo(ax * IMAGE_WIDTH, ay * IMAGE_HEIGHT);
            cr.lineTo(bx * IMAGE_WIDTH, by * IMAGE_HEIGHT);
        });
        cr.setLineWidth(width);
        cr.setSourceRGBA(0, 0, 0, alpha);
        cr.stroke();
    }
    cr.$dispose();
    return mask;
}

function createSkyTile(plate) {
    const tile = new Cairo.ImageSurface(Cairo.Format.ARGB32, 2800, 360);
    const cr = new Cairo.Context(tile);
    for (const mirrored of [false, true]) {
        cr.save();
        if (mirrored) {
            cr.translate(2800, 0);
            cr.scale(-2, 2);
        } else {
            cr.scale(2, 2);
        }
        cr.rectangle(0, 0, 700, 180);
        cr.clip();
        cr.setSourceSurface(plate, -440, 0);
        cr.paint();
        cr.restore();
    }
    // Match the original sky's row palette, especially the bright horizon haze.
    // The moving texture supplies detail; row colour never travels with the tile.
    const rows = SceneData.SKY_COLOR_ROWS ?? [];
    for (let y = 0; y < Math.min(360, rows.length); y++) {
        const {target, source} = rows[y];
        const gain = Math.min(0.85, ...target.map((value, index) => value / Math.max(1, source[index])));
        cr.setOperator(Cairo.Operator.OVER);
        cr.setSourceRGBA(0, 0, 0, 1 - gain);
        cr.rectangle(0, y, 2800, 1);
        cr.fill();
        cr.setOperator(Cairo.Operator.ADD);
        cr.setSourceRGBA(...target.map((value, index) => Math.max(0, value - source[index] * gain) / 255), 1);
        cr.rectangle(0, y, 2800, 1);
        cr.fill();
    }
    cr.$dispose();
    return tile;
}

function polygonPath(cr, points) {
    cr.newPath();
    points.forEach(([x, y], index) => index === 0 ? cr.moveTo(x, y) : cr.lineTo(x, y));
    cr.closePath();
}

function clearance(x, y, polygon) {
    let inside = false;
    let nearest = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, ay] = polygon[j];
        const [bx, by] = polygon[i];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax)
            inside = !inside;
        const dx = bx - ax, dy = by - ay;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(x - ax - u * dx, y - ay - u * dy));
    }
    return inside ? nearest : 0;
}

function createPhotoRegion(data, kind) {
    const points = data.polygon.map(([x, y]) => [x * IMAGE_WIDTH, y * IMAGE_HEIGHT]);
    const x = Math.floor(Math.min(...points.map(point => point[0]))) - 1;
    const y = Math.floor(Math.min(...points.map(point => point[1]))) - 1;
    const width = Math.ceil(Math.max(...points.map(point => point[0]))) - x + 1;
    const height = Math.ceil(Math.max(...points.map(point => point[1]))) - y + 1;
    const flow = kind === 'river' ? [8, 18] : (data.direction ?? [-0.2, -0.98]).map(value => value * 38);
    const feather = Math.max(data.feather ?? (kind === 'river' ? 18 : 24), Math.hypot(...flow) / 2 + 2);
    const cell = kind === 'river' ? 12 : 16;
    const columns = Math.max(2, Math.ceil(width / cell));
    const rows = Math.max(2, Math.ceil(height / cell));
    const vertices = [];
    for (let row = 0; row <= rows; row++) {
        const line = [];
        for (let column = 0; column <= columns; column++) {
            const vx = x + column * width / columns;
            const vy = y + row * height / rows;
            line.push({x: vx, y: vy, edge: Math.min(1, clearance(vx, vy, points) / feather)});
        }
        vertices.push(line);
    }
    const triangles = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = vertices[row][column], b = vertices[row][column + 1];
            const c = vertices[row + 1][column], d = vertices[row + 1][column + 1];
            for (const triangle of [[a, b, d], [a, d, c]]) {
                if (triangle.some(vertex => vertex.edge > 0))
                    triangles.push(triangle);
            }
        }
    }
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const context = new Cairo.Context(surface);
    context.translate(-x, -y);
    const mask = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const maskCr = new Cairo.Context(mask);
    maskCr.translate(-x, -y);
    polygonPath(maskCr, points);
    maskCr.setSourceRGBA(1, 1, 1, 1);
    maskCr.fill();
    maskCr.setOperator(Cairo.Operator.DEST_OUT);
    for (const [lineWidth, alpha] of [[8, 0.25], [5, 0.4], [2, 1]]) {
        polygonPath(maskCr, points);
        maskCr.setLineWidth(lineWidth);
        maskCr.setSourceRGBA(0, 0, 0, alpha);
        maskCr.stroke();
    }
    maskCr.$dispose();
    return {kind, x, y, width, height, flow, triangles, period: data.period ?? 5, surface, context, mask, frame: -1};
}

function affineTransform(cr, a, b, c, d, e, f) {
    // GJS Cairo exposes translate/rotate/scale but no arbitrary matrix setter.
    // A two-dimensional singular-value decomposition provides the same affine map.
    const angleV = 0.5 * Math.atan2(2 * (a * c + b * d), a * a + b * b - c * c - d * d);
    const cosV = Math.cos(angleV), sinV = Math.sin(angleV);
    const ux = a * cosV + c * sinV, uy = b * cosV + d * sinV;
    const scaleU = Math.hypot(ux, uy);
    cr.translate(e, f);
    cr.rotate(Math.atan2(uy, ux));
    cr.scale(scaleU, (a * d - b * c) / scaleU);
    cr.rotate(-angleV);
}

function paintTriangle(cr, plate, triangle, flow, phase, alpha, time, ripple) {
    const source = triangle.map(vertex => ({
        x: vertex.x - vertex.edge * (phase * flow[0] + (ripple ? Math.sin(vertex.y * 0.1 + time * 2.6) * 1.1 : 0)),
        y: vertex.y - vertex.edge * phase * flow[1],
    }));
    const [s0, s1, s2] = source;
    const [t0, t1, t2] = triangle;
    const sx1 = s1.x - s0.x, sy1 = s1.y - s0.y;
    const sx2 = s2.x - s0.x, sy2 = s2.y - s0.y;
    const dx1 = t1.x - t0.x, dy1 = t1.y - t0.y;
    const dx2 = t2.x - t0.x, dy2 = t2.y - t0.y;
    const determinant = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(determinant) < 0.01)
        return;
    const a = (dx1 * sy2 - dx2 * sy1) / determinant;
    const b = (dy1 * sy2 - dy2 * sy1) / determinant;
    const c = (-dx1 * sx2 + dx2 * sx1) / determinant;
    const d = (-dy1 * sx2 + dy2 * sx1) / determinant;
    cr.save();
    cr.setAntialias(Cairo.Antialias.NONE);
    cr.moveTo(t0.x, t0.y);
    cr.lineTo(t1.x, t1.y);
    cr.lineTo(t2.x, t2.y);
    cr.closePath();
    cr.clip();
    affineTransform(cr, a, b, c, d, t0.x - a * s0.x - c * s0.y, t0.y - b * s0.x - d * s0.y);
    cr.setSourceSurface(plate, 0, 0);
    if (alpha >= 0.999)
        cr.paint();
    else
        cr.paintWithAlpha(alpha);
    cr.restore();
}

class SceneRenderer {
    constructor(imagePath, seed) {
        if (!imagePath)
            throw new Error('Nightfall renderer needs the city.png path to animate its cloud layer.');
        this.plate = Cairo.ImageSurface.createFromPNG(imagePath);
        this.skyMask = createSkyMask();
        this.skyTile = createSkyTile(this.plate);
        this.photoRegions = [
            ...(SceneData.PHOTO_SMOKE ?? []).map(region => createPhotoRegion(region, 'smoke')),
            ...(SceneData.RIVER ?? []).map(region => createPhotoRegion(region, 'river')),
        ];
        this.rain = createRain();
        this.glows = new Map();
        this.routes = TRAFFIC.map(makeRoute);
        this.sim = createSimulation(SceneData, seed);
    }

    update(dt, pointer = {x: 0.5, y: 0.5, active: false}, rain = 1) {
        this.sim.step(dt, pointer, rain);
    }

    drawSky(cr, time) {
        cr.save();
        cr.setSourceSurface(this.skyTile, -(time * 5 % 2800), 0);
        cr.getSource().setExtend(Cairo.Extend.REPEAT);
        cr.maskSurface(this.skyMask, 0, 0);
        cr.restore();
    }

    drawPhotoFlow(cr, time, kind = null) {
        const frame = Math.floor(time * 12);
        for (const region of this.photoRegions) {
            if (kind && kind !== region.kind)
                continue;
            if (region.frame !== frame) {
                const context = region.context;
                context.setSourceSurface(this.plate, 0, 0);
                context.paint();
                const phase = fraction(time / region.period);
                const secondary = fraction(phase + 0.5);
                const blend = 1 - Math.sin(Math.PI * phase) ** 2;
                for (const triangle of region.triangles)
                    paintTriangle(context, this.plate, triangle, region.flow, phase - 0.5, 1, time, region.kind === 'river');
                if (blend > 0.0001) {
                    for (const triangle of region.triangles)
                        paintTriangle(context, this.plate, triangle, region.flow, secondary - 0.5, blend, time, region.kind === 'river');
                }
                region.frame = frame;
            }
            cr.save();
            cr.rectangle(region.x, region.y, region.width, region.height);
            cr.clip();
            cr.setSourceSurface(region.surface, region.x, region.y);
            cr.maskSurface(region.mask, region.x, region.y);
            cr.restore();
        }
    }

    glow(cr, x, y, radius, color, alpha) {
        if (radius <= 0 || alpha <= 0)
            return;
        const key = color.join(',');
        let texture = this.glows.get(key);
        if (!texture) {
            texture = new Cairo.ImageSurface(Cairo.Format.ARGB32, 64, 64);
            const context = new Cairo.Context(texture);
            const gradient = new Cairo.RadialGradient(32, 32, 0, 32, 32, 31);
            const [r, g, b] = color.map(value => value / 255);
            gradient.addColorStopRGBA(0, r, g, b, 0.90);
            gradient.addColorStopRGBA(0.22, r, g, b, 0.32);
            gradient.addColorStopRGBA(0.65, r, g, b, 0.07);
            gradient.addColorStopRGBA(1, r, g, b, 0);
            context.setSource(gradient);
            context.paint();
            context.$dispose();
            this.glows.set(key, texture);
        }
        cr.save();
        cr.translate(x, y);
        cr.scale(radius / 32, radius / 32);
        cr.setSourceSurface(texture, -32, -32);
        cr.paintWithAlpha(Math.min(1, alpha));
        cr.restore();
    }

    drawLights(cr) {
        LIGHTS.forEach((light, index) => {
            const state = this.sim.windows[index];
            const intensity = Math.max(0, Math.min(1, state?.brightness ?? 1));
            const color = state?.color ?? light.color;
            const x = light.x * IMAGE_WIDTH;
            const y = light.y * IMAGE_HEIGHT;
            const [r, g, b] = color.map(value => value / 255);
            if (light.sourceWindow) {
                if (intensity < 0.999) {
                    const off = (light.offColor ?? [12, 25, 35]).map(value => value / 255);
                    cr.newPath();
                    for (const [dx, dy, width, height] of light.maskRects ?? [[-light.w / 2, -light.h / 2, light.w, light.h]])
                        cr.rectangle(x + dx, y + dy, width, height);
                    cr.setSourceRGBA(...off, (1 - intensity) * 0.99);
                    cr.fill();
                }
                return;
            }
            // Cover the photograph's lit window when it switches off. Otherwise
            // an additive sparkle alone cannot produce a visible off state.
            const [offR, offG, offB] = (light.offColor ?? [12, 25, 35]).map(value => value / 255);
            cr.setSourceRGBA(offR, offG, offB, (1 - intensity) * 0.97);
            cr.rectangle(x - light.w / 2 - 0.35, y - light.h / 2 - 0.35, light.w + 0.7, light.h + 0.7);
            cr.fill();
            cr.setSourceRGBA(r, g, b, intensity * 0.94);
            cr.rectangle(x - light.w / 2, y - light.h / 2, light.w, light.h);
            cr.fill();
            this.glow(cr, x, y, Math.max(7, Math.min(20, light.w + light.h)), color,
                intensity * (light.kind === 'neon' ? 0.40 : 0.29));
        });
    }

    drawTraffic(cr) {
        for (const vehicle of this.sim.vehicles) {
            if (vehicle.active === false)
                continue;
            const route = this.routes[vehicle.routeIndex];
            if (!route || route.points.length < 2 || route.length <= 0)
                continue;
            const phase = Math.max(0, Math.min(1, vehicle.progress));
            const [px, py] = routePoint(route, phase);
            const [ax, ay] = routePoint(route, Math.max(0, phase - 0.005));
            const [bx, by] = routePoint(route, Math.min(1, phase + 0.005));
            const segment = Math.max(0.001, Math.hypot(bx - ax, by - ay));
            const nx = -(by - ay) / segment;
            const ny = (bx - ax) / segment;
            const x = px + nx * vehicle.lane;
            const y = py + ny * vehicle.lane;
            const tail = routePoint(route, phase - vehicle.direction * vehicle.length / route.length);
            const alpha = vehicle.alpha;
            const color = vehicle.color;
            const [r, g, b] = color.map(value => value / 255);
            this.glow(cr, x, y, 8, color, alpha * 0.62);
            cr.setSourceRGBA(r, g, b, alpha * 0.54);
            cr.setLineWidth(1.0);
            cr.moveTo(tail[0] + nx * vehicle.lane, tail[1] + ny * vehicle.lane);
            cr.lineTo(x, y);
            cr.stroke();
            cr.setSourceRGBA(Math.min(1, r + 0.25), Math.min(1, g + 0.25), Math.min(1, b + 0.25), alpha);
            for (const side of [-0.7, 0.7]) {
                cr.arc(x + nx * side, y + ny * side, 0.85, 0, TAU);
                cr.fill();
            }
        }
    }

    drawReflections(cr, time) {
        for (const reflection of REFLECTIONS) {
            const x = reflection.x * IMAGE_WIDTH;
            const width = reflection.w * IMAGE_WIDTH;
            const height = reflection.h * IMAGE_HEIGHT;
            const y = reflection.y * IMAGE_HEIGHT - height / 2;
            const [r, g, b] = reflection.color.map(value => value / 255);
            cr.save();
            if (reflection.polygon?.length > 2) {
                cr.newPath();
                reflection.polygon.forEach(([px, py], index) => {
                    if (index === 0)
                        cr.moveTo(px * IMAGE_WIDTH, py * IMAGE_HEIGHT);
                    else
                        cr.lineTo(px * IMAGE_WIDTH, py * IMAGE_HEIGHT);
                });
                cr.closePath();
                cr.clip();
            }
            for (let row = 0; row < 15; row++) {
                const progress = row / 15;
                const shimmer = 0.5 + 0.5 * Math.sin(time * 1.5 + reflection.phase + row * 1.9);
                const wobble = Math.sin(time * 0.65 + row * 0.7 + reflection.phase) * width * 0.19;
                const halfWidth = width * (0.12 + progress * 0.36) * (0.35 + shimmer * 0.65);
                cr.setSourceRGBA(r, g, b, (1 - progress) * shimmer * 0.19);
                cr.setLineWidth(0.65 + progress * 1.4);
                cr.moveTo(x + wobble - halfWidth, y + progress * height);
                cr.lineTo(x + wobble + halfWidth, y + progress * height);
                cr.stroke();
            }
            cr.restore();
        }
    }

    drawSearchlights(cr, time) {
        SEARCHLIGHTS.forEach((beam, index) => {
            const x = beam.x * IMAGE_WIDTH;
            const y = beam.y * IMAGE_HEIGHT;
            const angle = beam.angle + Math.sin(time / (beam.period ?? (10.5 + index * 2.3)) * TAU + beam.phase) * Math.max(0.5, beam.swing);
            const length = beam.length * IMAGE_HEIGHT;
            const endX = x + Math.cos(angle) * length;
            const endY = y + Math.sin(angle) * length;
            // Nested cones soften the edges while retaining a visible moving shaft
            // through the city mist. They are deliberately not clipped to sky only.
            for (const [spread, strength] of [[0.078, 0.09], [0.047, 0.13], [0.019, 0.15]]) {
                const gradient = new Cairo.LinearGradient(x, y, endX, endY);
                gradient.addColorStopRGBA(0, 0.63, 0.80, 0.91, strength);
                gradient.addColorStopRGBA(0.62, 0.63, 0.80, 0.91, strength * 0.48);
                gradient.addColorStopRGBA(1, 0.63, 0.80, 0.91, 0);
                cr.moveTo(x, y);
                cr.lineTo(x + Math.cos(angle - spread) * length, y + Math.sin(angle - spread) * length);
                cr.lineTo(x + Math.cos(angle + spread) * length, y + Math.sin(angle + spread) * length);
                cr.closePath();
                cr.setSource(gradient);
                cr.fill();
            }
            this.glow(cr, x, y, 12, [172, 221, 249], 0.68);
        });
    }

    paint(cr, width, height, time = this.sim.time) {
        const motion = this.sim;
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);
        const scale = Math.max(width / IMAGE_WIDTH, height / IMAGE_HEIGHT);
        cr.save();
        cr.translate((width - IMAGE_WIDTH * scale) / 2, (height - IMAGE_HEIGHT * scale) / 2);
        cr.scale(scale, scale);

        this.drawSky(cr, time);
        cr.save();
        skyClip(cr);
        for (const ship of SHIPS)
            drawShip(cr, ship, time, IMAGE_WIDTH, IMAGE_HEIGHT);
        cr.restore();
        this.drawPhotoFlow(cr, time);
        this.drawSearchlights(cr, time);
        this.drawLights(cr);
        this.drawTraffic(cr);
        this.drawReflections(cr, time);
        cr.restore();

        this.drawRain(cr, width, height, motion);
    }

    drawRain(cr, width, height, motion = this.sim) {
        const time = this.sim.time;
        const unit = Math.max(0.65, height / 1080);
        for (const layer of this.rain) {
            cr.setSourceRGBA(0.65, 0.79, 0.85, layer.alpha);
            cr.setLineWidth(layer.width * unit);
            for (const drop of layer.drops) {
                const speed = layer.speed * drop.variation;
                const y = (fraction(drop.y + time * speed) * 1.10 - 0.05) * height;
                const x = (fraction(drop.x - time * speed * 0.055 + motion.windOffset) * 1.10 - 0.05) * width;
                const length = layer.length * unit * drop.variation;
                cr.moveTo(x, y);
                cr.lineTo(x + length * (-0.22 + motion.wind * 1.35), y + length);
            }
            cr.stroke();
        }
    }

    destroy() {
        this.plate.finish();
        this.skyMask.finish();
        this.skyTile.finish();
        for (const region of this.photoRegions) {
            region.context.$dispose();
            region.surface.finish();
            region.mask.finish();
        }
        for (const texture of this.glows.values())
            texture.finish();
        this.glows.clear();
        this.photoRegions = [];
        this.rain = [];
        this.routes = [];
        this.sim = null;
    }
}

export function createSceneRenderer(imagePath, seed) {
    return new SceneRenderer(imagePath, seed);
}
