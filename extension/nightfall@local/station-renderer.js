/* Native approved photographic station: fixed architecture and source lighting,
 * independent lamps, machinery, steam and masked sky dust. No character rendering. */
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Data from './station-data.js';
import {createStationMotion} from './station-motion-realism.js';
import {createStationLighting} from './station-realism-lighting.js';
import {createStationIndustrial, Model as IndustrialModel} from './station-industrial-native.js';
import {createStationSpace} from './station-space-native.js';
import {StationCanvas} from './station-canvas.js';
import {POOLS} from './station-practical-data.js';

const TAU = Math.PI * 2;
function trace(cr, points) {
    if (!points?.length) return;
    points.forEach(([x, y], index) => index ? cr.lineTo(x, y) : cr.moveTo(x, y));
    cr.closePath();
}
function photoCutout(plate, regions, surface = null) {
    surface ??= new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
    const cr = new Cairo.Context(surface);
    cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
    for (const region of regions) {
        if (!region.polygon?.length) continue;
        cr.save(); cr.newPath(); trace(cr, region.polygon);
        for (const hole of region.holes ?? []) trace(cr, hole);
        cr.setFillRule(Cairo.FillRule.EVEN_ODD); cr.clip();
        cr.setSourceSurface(plate, 0, 0); cr.paint(); cr.restore();
    }
    cr.$dispose(); return surface;
}

class StationRenderer {
    constructor(imagePath, seed) {
        if (!imagePath) throw new Error('Station renderer needs its source photograph.');
        this.motion = createStationMotion({...Data, HANGAR: {...Data.HANGAR, workers: []}}, seed);
        this.destroyed = false;
        this.time = 0;
        this.intensity = 1;
        this.glows = new Map();
        this.plate = Cairo.ImageSurface.createFromPNG(imagePath);
        this.occluders = photoCutout(this.plate, Data.HANGAR?.occluders ?? []);
        this.lighting = createStationLighting();
        this.reliefPath = GLib.build_filenamev([GLib.path_get_dirname(imagePath), 'station-relief']);
        const [, bytes] = Gio.File.new_for_path(GLib.build_filenamev([this.reliefPath, 'lighting.json'])).load_contents(null);
        this.relief = JSON.parse(new TextDecoder().decode(bytes));
        this.darkMask = this.loadRelief(this.relief.dark);
        this.sectors = this.relief.sectors.map(s => this.loadRelief(s.path));
        this.effectsPath = GLib.build_filenamev([GLib.path_get_dirname(imagePath), 'station-native']);
        this.sprites = Array.from({length: 8}, (_, i) => this.loadEffect(`puff-${i}.png`));
        this.industrial = createStationIndustrial(this.sprites);
        this.space = createStationSpace(this.effectsPath);
        this.practicalPools = POOLS.map(pool => ({...pool, surface: this.loadEffect(pool.file)}));
        this.weldResponses = this.relief.welds.map((w, i) => ({...w, surface: this.loadEffect(`weld-${i}.png`)}));
        this.coloredPlate = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.directionLayers = new Map();
        this.baseRelitPlate = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.baseLightSignature = null;
        this.relitPlate = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.responseMask = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.sectorMask = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.scanMask = new Cairo.ImageSurface(Cairo.Format.ARGB32, Data.IMAGE_WIDTH, Data.IMAGE_HEIGHT);
        this.lightCacheTick = -1;
        this.lightDirty = true;
    }

    update(dt, _pointer = {}, intensity = 1) {
        if (this.destroyed) return;
        const oldIntensity = this.intensity;
        this.intensity = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 1));
        if (oldIntensity !== this.intensity) this.lightDirty = true;
        this.motion.update(dt, this.intensity);
        this.lighting.update(dt);
        this.time = this.motion.time;
    }

    setMode(id, immediate = false) {
        const accepted = this.lighting.setMode(id, immediate);
        if (accepted) this.lightDirty = true;
        return accepted;
    }

    loadEffect(name) {
        return Cairo.ImageSurface.createFromPNG(GLib.build_filenamev([this.effectsPath, name]));
    }

    loadRelief(name) {
        return Cairo.ImageSurface.createFromPNG(GLib.build_filenamev([this.reliefPath, name]));
    }

    directionLayer(index) {
        if (!this.directionLayers.has(index)) {
            if (this.directionLayers.size >= 4) {
                const key = this.directionLayers.keys().next().value;
                this.directionLayers.get(key).finish(); this.directionLayers.delete(key);
            }
            this.directionLayers.set(index, this.loadRelief(this.relief.layers[index]));
        }
        return this.directionLayers.get(index);
    }

    rebuildBaseLighting() {
        const state = this.lighting.state, count = this.relief.layers.length;
        let angle = Math.atan2(state.direction[1], state.direction[0]);
        if (angle < 0) angle += TAU;
        const phase = angle / TAU * count, left = Math.floor(phase) % count, right = (left + 1) % count, weight = phase - Math.floor(phase);
        const response = new Cairo.Context(this.responseMask), sectors = new Cairo.Context(this.sectorMask);
        response.setOperator(Cairo.Operator.CLEAR); response.paint(); response.setOperator(Cairo.Operator.ADD);
        response.setSourceSurface(this.directionLayer(left), 0, 0); response.paintWithAlpha(1 - weight);
        response.setSourceSurface(this.directionLayer(right), 0, 0); response.paintWithAlpha(weight);
        const maximum = Math.max(.001, ...state.sectorWeights);
        sectors.setOperator(Cairo.Operator.CLEAR); sectors.paint(); sectors.setOperator(Cairo.Operator.ADD);
        this.sectors.forEach((surface, i) => {sectors.setSourceSurface(surface, 0, 0); sectors.paintWithAlpha(state.sectorWeights[i] / maximum);});
        response.setOperator(Cairo.Operator.DEST_IN); response.setSourceSurface(this.sectorMask, 0, 0); response.paint();
        response.$dispose(); sectors.$dispose();
        const p = new Cairo.Context(this.baseRelitPlate);
        p.setOperator(Cairo.Operator.SOURCE); p.setSourceSurface(this.plate, 0, 0); p.paint(); p.setOperator(Cairo.Operator.OVER);
        p.setSourceRGBA(0, 0, 0, state.darkness); p.maskSurface(this.darkMask, 0, 0);
        // Multiply the photographed material by light colour before applying
        // the relief mask. The old flat tint erased the hull's fine contrast.
        const colored = new Cairo.Context(this.coloredPlate);
        colored.setOperator(Cairo.Operator.SOURCE); colored.setSourceSurface(this.plate, 0, 0); colored.paint();
        colored.setOperator(Cairo.Operator.MULTIPLY); colored.setSourceRGB(...state.keyColor.map(v => v / 255)); colored.paint(); colored.$dispose();
        const material = new Cairo.Context(this.responseMask);
        material.setOperator(Cairo.Operator.IN); material.setSourceSurface(this.coloredPlate, 0, 0); material.paint(); material.$dispose();
        p.setOperator(Cairo.Operator.ADD); p.setSourceSurface(this.responseMask, 0, 0); p.paintWithAlpha(state.key * maximum);
        p.$dispose();
    }

    rebuildLighting() {
        const state = this.lighting.state;
        const signature = JSON.stringify([state.direction, state.darkness, state.key, state.keyColor, state.sectorWeights]);
        if (signature !== this.baseLightSignature) {
            this.rebuildBaseLighting(); this.baseLightSignature = signature;
        }
        const p = new Cairo.Context(this.relitPlate);
        p.setOperator(Cairo.Operator.SOURCE); p.setSourceSurface(this.baseRelitPlate, 0, 0); p.paint();
        p.setOperator(Cairo.Operator.ADD);
        this.practicalPools.forEach((pool, i) => {
            p.setSourceSurface(pool.surface, pool.x, pool.y);
            p.paintWithAlpha(Math.min(.7, this.motion.workLights[i].brightness * state.workLightGain));
        });
        this.weldResponses.forEach((responseMap, index) => {
            const brightness = this.motion.welders[index]?.brightness ?? 0;
            if (brightness <= 0) return;
            p.setSourceSurface(responseMap.surface, responseMap.x, responseMap.y);
            p.paintWithAlpha(Math.min(1, brightness * state.weldGain));
        });
        p.$dispose();
        photoCutout(this.relitPlate, Data.HANGAR?.occluders ?? [], this.occluders);
        this.lightCacheTick = Math.floor(this.lighting.time * 12);
        this.lightDirty = false;
    }

    glow(cr, x, y, radius, color, alpha) {
        if (alpha <= 0 || radius <= 0) return;
        const key = color.join(',');
        let texture = this.glows.get(key);
        if (!texture) {
            texture = new Cairo.ImageSurface(Cairo.Format.ARGB32, 64, 64);
            const p = new Cairo.Context(texture), gradient = new Cairo.RadialGradient(32, 32, 0, 32, 32, 31);
            const [r, g, b] = color.map(v => v / 255);
            gradient.addColorStopRGBA(0, r, g, b, .8);
            gradient.addColorStopRGBA(.25, r, g, b, .22);
            gradient.addColorStopRGBA(1, r, g, b, 0);
            p.setSource(gradient); p.paint(); p.$dispose(); this.glows.set(key, texture);
        }
        cr.save(); cr.translate(x, y); cr.scale(radius / 32, radius / 32);
        cr.setSourceSurface(texture, -32, -32); cr.paintWithAlpha(alpha); cr.restore();
    }

    ellipse(cr, x, y, rx, ry, color, alpha) {
        cr.save(); cr.translate(x, y); cr.scale(rx, ry);
        cr.setSourceRGBA(...color.map(v => v / 255), alpha); cr.arc(0, 0, 1, 0, TAU); cr.fill(); cr.restore();
    }

    drawWelding(cr, welder) {
        if (welder.brightness > 0) {
            this.glow(cr, ...welder.tool, Math.max(4, welder.height * .8), [119, 198, 239], welder.brightness * .30 * this.lighting.state.weldGain);
            cr.setSourceRGBA(.85, .95, 1, welder.brightness); cr.arc(...welder.tool, .65, 0, TAU); cr.fill();
        }
        cr.setLineWidth(.55); cr.setLineCap(Cairo.LineCap.ROUND);
        for (const spark of welder.sparks) {
            cr.setSourceRGBA(1, .70, .31, spark.alpha * .9);
            cr.moveTo(spark.x, spark.y); cr.lineTo(spark.x - Math.cos(spark.angle) * spark.length, spark.y - Math.sin(spark.angle) * spark.length); cr.stroke();
        }
    }

    drawHangar(cr) {
        cr.save(); cr.newPath(); trace(cr, Data.HANGAR?.aperture); cr.clip();
        this.industrial.machinery(new StationCanvas(cr), this.motion.activityTime);
        cr.setSourceSurface(this.occluders, 0, 0); cr.paint();
        for (const welder of this.motion.welders) this.drawWelding(cr, welder);
        cr.restore();
    }

    drawWindows(cr) {
        (Data.STATION_LIGHTS ?? []).forEach((light, index) => {
            const value = Math.min(1, this.motion.windows[index].value * this.lighting.state.windowFactor);
            const off = (1 - value) * (1 - (light.minLight ?? 0));
            if (off < .005) return;
            cr.setSourceRGBA(...(light.offColor ?? [22, 27, 31]).map(v => v / 255), off);
            for (const [dx, dy, w, h] of light.maskRects ?? [[-light.w / 2, -light.h / 2, light.w, light.h]])
                cr.rectangle(light.x + dx, light.y + dy, w, h);
            cr.fill();
        });
    }

    drawBeacons(cr) {
        (Data.BEACONS ?? []).forEach((beacon, index) => {
            const pulse = this.motion.beaconBrightness(index), color = beacon.color ?? [255, 70, 40];
            cr.setSourceRGBA(...(beacon.offColor ?? [15, 19, 24]).map(v => v / 255), (1 - pulse) * .98);
            for (const [dx, dy, w, h] of beacon.maskRects ?? [[-1, -1, 2, 2]]) cr.rectangle(beacon.x + dx, beacon.y + dy, w, h);
            cr.fill();
            const addedLight = pulse * (beacon.strength ?? 1);
            this.glow(cr, beacon.x, beacon.y, (beacon.haloRadius ?? 7) * 1.15, color, addedLight * .72 * this.lighting.state.exteriorGain);
            cr.setSourceRGBA(...color.map(v => v / 255), addedLight);
            cr.arc(beacon.x, beacon.y, beacon.coreRadius ?? .9, 0, TAU); cr.fill();
        });
    }

    drawSequences(cr) {
        (Data.SEQUENCE_LIGHTS ?? []).forEach((sequence, index) => {
            const color = sequence.color ?? [132, 215, 243];
            (sequence.points ?? []).forEach(([x, y], lightIndex) => {
                const value = this.motion.sequenceBrightness(index, lightIndex) * (sequence.strength ?? 1);
                this.glow(cr, x, y, (sequence.radius ?? .8) * 4, color, value * .42 * this.lighting.state.exteriorGain);
                cr.setSourceRGBA(...color.map(v => v / 255), .15 + value * .85);
                cr.arc(x, y, sequence.radius ?? .8, 0, TAU); cr.fill();
            });
        });
    }

    paint(cr, width, height) {
        if (this.destroyed) { cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER); return; }
        if (this.lightDirty || this.lightCacheTick !== Math.floor(this.lighting.time * 12)) this.rebuildLighting();
        cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
        const scale = Math.max(width / Data.IMAGE_WIDTH, height / Data.IMAGE_HEIGHT);
        cr.save(); cr.translate((width - Data.IMAGE_WIDTH * scale) / 2, (height - Data.IMAGE_HEIGHT * scale) / 2); cr.scale(scale, scale);
        cr.setSourceSurface(this.relitPlate, 0, 0); cr.paint();
        this.space.render(cr, this.time);
        this.drawWindows(cr); this.drawBeacons(cr); this.drawSequences(cr);
        const mechanical = new StationCanvas(cr);
        this.industrial.neon(mechanical, this.motion, this.lighting.state);
        this.industrial.rotor(mechanical, this.motion.activityTime);
        this.drawHangar(cr);
        this.steamCount = this.industrial.steam(mechanical, this.motion.activityTime, this.intensity);
        cr.restore();
    }

    getDiagnostics() {
        return {scene: 'station', native: true, workers: this.motion.workers.length, flyingShips: 0,
            time: this.time, activityTime: this.motion.activityTime, windows: this.motion.windows.length,
            steam: this.steamCount ?? 0, vents: IndustrialModel.vents.length,
            mechanism: this.industrial.carriagePosition(this.motion.activityTime), destroyed: this.destroyed};
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.space.destroy();
        for (const surface of this.sprites) surface.finish(); this.sprites = [];
        for (const pool of this.practicalPools) pool.surface.finish(); this.practicalPools = [];
        this.coloredPlate.finish();
        for (const texture of this.glows.values()) texture.finish();
        this.glows.clear(); this.occluders.finish(); this.plate.finish();
        this.baseRelitPlate.finish(); this.relitPlate.finish(); this.responseMask.finish(); this.sectorMask.finish(); this.scanMask.finish(); this.darkMask.finish();
        for (const surface of this.directionLayers.values()) surface.finish(); this.directionLayers.clear();
        for (const surface of this.sectors) surface.finish();
        for (const responseMap of this.weldResponses) responseMap.surface.finish();
        this.motion.workers.length = 0; this.motion.welders.length = 0;
    }
}

export function createStationRenderer(imagePath, seed) {return new StationRenderer(imagePath, seed);}
