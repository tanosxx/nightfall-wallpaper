/* Native photographic battlefield. Geometry stays in the original photograph;
 * the same ordered effect modules run in the browser and on the desktop. */
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import {TitansCanvas} from './titans-canvas.js';
import {createTitansTimeline, TITANS_WIDTH, TITANS_HEIGHT} from './titans-timeline.js';
import {GROUND_ASSET_FILES, createGroundEffects} from './titans-ground.js';
import {SKY_ASSET_FILES, createSkyEffects} from './titans-sky.js';
import {LEFT_SMOKE_ASSET_FILES, createLeftSmokeEffects} from './titans-left-smoke.js';
import {SUIT_ASSET_FILES, createSuitEffects} from './titans-suit.js';

class TitansRenderer {
    constructor(imagePath) {
        if (!imagePath) throw new Error('Titans renderer requires its photograph path.');
        this.destroyed = false; this.surfaces = []; this.assets = {};
        this.clock = createTitansTimeline(); this.sky = null; this.ground = null; this.leftSmoke = null; this.suit = null;
        const directory = GLib.build_filenamev([GLib.path_get_dirname(imagePath), 'titans']);
        try {
            const files = {...GROUND_ASSET_FILES, ...SKY_ASSET_FILES, ...LEFT_SMOKE_ASSET_FILES, ...SUIT_ASSET_FILES};
            const loaded = new Map();
            for (const [key, name] of Object.entries(files)) {
                if (name.includes('/') || name.includes('\\')) throw new Error(`Invalid Titans asset filename: ${name}`);
                let asset = loaded.get(name);
                if (!asset) {
                    const surface = Cairo.ImageSurface.createFromPNG(GLib.build_filenamev([directory, name]));
                    this.surfaces.push(surface);
                    asset = {surface, width: surface.getWidth(), height: surface.getHeight(),
                        crops: new Map(), ownedSurfaces: this.surfaces};
                    loaded.set(name, asset);
                }
                this.assets[key] = asset;
            }
            this.sky = createSkyEffects(this.assets); this.ground = createGroundEffects(this.assets);
            this.leftSmoke = createLeftSmokeEffects(this.assets); this.suit = createSuitEffects(this.assets);
        } catch (error) { this.destroy(); throw error; }
    }
    get time() { return this.clock.time; }
    update(dt, _pointer = {}, intensity = 1) {
        if (!this.destroyed) this.clock.update(dt, intensity);
    }
    paint(cr, width, height) {
        cr.save();
        try {
            cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
            if (this.destroyed || !(width > 0 && height > 0)) return;
            const scale = Math.max(width / TITANS_WIDTH, height / TITANS_HEIGHT);
            cr.translate((width - TITANS_WIDTH * scale) / 2, (height - TITANS_HEIGHT * scale) / 2); cr.scale(scale, scale);
            cr.newPath(); cr.rectangle(0, 0, TITANS_WIDTH, TITANS_HEIGHT); cr.clip();
            const ctx = new TitansCanvas(cr);
            ctx.save(); this.leftSmoke.render(ctx, this.clock.time, this.clock.intensity); ctx.restore();
            ctx.save(); this.sky.render(ctx, this.clock.time, this.clock.intensity); ctx.restore();
            ctx.save(); this.ground.render(ctx, this.clock.time, this.clock.intensity); ctx.restore();
            ctx.save(); this.suit.render(ctx, this.clock.time, this.clock.intensity); ctx.restore();
        } finally { cr.restore(); }
    }
    getDiagnostics() {
        return {scene: 'titans', native: true, time: this.clock.time, intensity: this.clock.intensity,
            leftSmoke: this.leftSmoke?.getDiagnostics?.(this.clock.time, this.clock.intensity) ?? null,
            suit: this.suit?.getDiagnostics?.(this.clock.time, this.clock.intensity) ?? null,
            sky: this.sky?.getDiagnostics?.(this.clock.time, this.clock.intensity) ?? null,
            ground: this.ground?.getDiagnostics?.(this.clock.time, this.clock.intensity) ?? null,
            assets: this.surfaces.length, destroyed: this.destroyed};
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        try { this.sky?.destroy?.(); this.ground?.destroy?.(); this.leftSmoke?.destroy?.(); this.suit?.destroy?.(); }
        finally {
            for (const surface of this.surfaces) surface.finish();
            this.surfaces = []; this.assets = {}; this.sky = null; this.ground = null; this.leftSmoke = null; this.suit = null;
        }
    }
}
export function createTitansRenderer(imagePath) { return new TitansRenderer(imagePath); }
