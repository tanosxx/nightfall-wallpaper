/* Cloudcity: the original photographic clouds and light sources in Cairo.
 * All pixel extraction is baked during packaging, never on the Shell loop. */
import Cairo from 'cairo';
import {CLOUDCITY as Data} from './cloudcity-native-data.js';

const TAU = Math.PI * 2;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const smooth = value => { value = clamp(value); return value * value * (3 - 2 * value); };
const hash = value => { const v = Math.sin(value * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };

function schedule(seed, room) {
    const first = room?.first ?? 2 + hash(seed + 10) * 6;
    const on = room?.on ?? hash(seed + 11) > .31;
    let period = 0;
    const segments = [];
    for (let i = 0; i < 12; i++) {
        const target = i % 2 === 0 ? Number(!on) : Number(on);
        const fade = .22 + hash(seed + i * 23 + 3) * .55;
        const hold = target ? 14 + hash(seed + i * 31 + 2) * 57 : 4.5 + hash(seed + i * 39 + 4) * 17;
        segments.push({start: period, target, fade}); period += fade + hold;
    }
    return {first, on, period, segments, residual: room?.residual ?? .055 + hash(seed + 19) * .075};
}

function roomPower(state, time) {
    let power = Number(state.on);
    if (time >= state.first) {
        const phase = (time - state.first) % state.period;
        let segment = state.segments[0];
        for (const candidate of state.segments) if (phase >= candidate.start) segment = candidate;
        power = 1 - segment.target + (2 * segment.target - 1) * smooth((phase - segment.start) / segment.fade);
    }
    return state.residual + (1 - state.residual) * power;
}

function affine(cr, a, b, c, d) {
    // GJS Cairo exposes rotate/scale, but not arbitrary matrix setters.
    const v = .5 * Math.atan2(2 * (a * c + b * d), a * a + b * b - c * c - d * d);
    const ux = a * Math.cos(v) + c * Math.sin(v), uy = b * Math.cos(v) + d * Math.sin(v);
    const scale = Math.hypot(ux, uy);
    cr.rotate(Math.atan2(uy, ux)); cr.scale(scale, (a * d - b * c) / scale); cr.rotate(-v);
}

class CloudcityRenderer {
    constructor(imagePath) {
        if (!imagePath) throw new Error('Cloudcity needs its background image path.');
        this.time = 0; this.windTime = 0; this.weather = 1; this.destroyed = false;
        this.surfaces = [];
        const root = imagePath.slice(0, imagePath.lastIndexOf('/')) + '/cloudcity-native/';
        const load = name => {
            const surface = Cairo.ImageSurface.createFromPNG(root + name + '.png');
            this.surfaces.push(surface); return surface;
        };
        try {
            this.clouds = load('cloud-strip'); this.cloudMask = load('cloud-mask');
            this.darkWindows = load('windows-dark'); this.brightWindows = load('windows-bright');
            this.darkBeacons = load('beacons-dark');
            this.rotors = Data.rotors.map((rotor, index) => ({...rotor, sprite: load(`rotor-${index}`), cap: load(`hub-${index}`)}));
            this.circuits = Data.circuits.map(circuit => ({...circuit, schedule: schedule(circuit.seed, circuit.room)}));
        } catch (error) { this.destroy(); throw error; }
    }

    update(dt, _pointer = {}, weather = 1) {
        if (this.destroyed) return;
        this.weather = clamp(Number.isFinite(weather) ? weather : 1);
        const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
        this.time += elapsed;
        // Integrate wind independently so moving the control never jumps a
        // texture backward. Its speed is uniform at every image height.
        this.windTime += elapsed * (.4 + this.weather * .6);
    }

    drawClouds(cr) {
        const offset = (this.windTime * Data.cloudSpeed) % Data.cloudStripWidth;
        cr.save(); cr.rectangle(0, 0, Data.width, Data.height); cr.clip();
        cr.pushGroup();
        cr.setSourceSurface(this.clouds, offset - Data.cloudStripWidth, 0); cr.paint();
        cr.setSourceSurface(this.clouds, offset, 0); cr.paint();
        cr.popGroupToSource(); cr.maskSurface(this.cloudMask, 0, 0); cr.restore();
    }

    patch(cr, surface, patch, opacity) {
        if (opacity <= .002) return;
        cr.save(); cr.rectangle(patch.x, patch.y, patch.w, patch.h); cr.clip();
        cr.setSourceSurface(surface, patch.x - patch.atlasX, patch.y - patch.atlasY);
        cr.paintWithAlpha(opacity); cr.restore();
    }

    drawWindows(cr) {
        for (const circuit of this.circuits) {
            const power = roomPower(circuit.schedule, this.time);
            this.patch(cr, this.darkWindows, circuit, 1 - power);
            if (circuit.relight) this.patch(cr, this.brightWindows, circuit, power * .56);
        }
    }

    drawBeacons(cr) {
        for (const beacon of Data.beacons) {
            const phase = ((this.time + beacon.offset) % beacon.period) / beacon.period;
            const power = .018 + .982 * Math.exp(-Math.pow(Math.min(phase, 1 - phase) / .105, 2));
            this.patch(cr, this.darkBeacons, beacon.mask, 1 - power);
            const radius = 8 * beacon.scale;
            const glow = new Cairo.RadialGradient(beacon.x, beacon.y, 0, beacon.x, beacon.y, radius);
            glow.addColorStopRGBA(0, 1, 53 / 255, 63 / 255, power * .75);
            glow.addColorStopRGBA(.22, 1, 31 / 255, 44 / 255, power * .31);
            glow.addColorStopRGBA(1, 1, 25 / 255, 40 / 255, 0);
            cr.save(); cr.setOperator(Cairo.Operator.SCREEN); cr.setSource(glow);
            cr.rectangle(beacon.x - radius, beacon.y - radius, radius * 2, radius * 2); cr.fill();
            cr.setSourceRGBA(1, 135 / 255, 117 / 255, power * .82);
            cr.translate(beacon.x, beacon.y); cr.scale(Math.max(.42, beacon.scale), Math.max(.42, beacon.scale * .75));
            cr.arc(0, 0, 1, 0, TAU); cr.fill(); cr.restore();
        }
    }

    drawTurbines(cr) {
        for (const rotor of this.rotors) {
            cr.save(); cr.translate(rotor.cx, rotor.cy);
            affine(cr, rotor.rx, 0, rotor.shear, rotor.ry);
            cr.rotate(rotor.phase + this.windTime * rotor.speed);
            cr.scale(2 / rotor.size, 2 / rotor.size);
            cr.setSourceSurface(rotor.sprite, -rotor.size / 2, -rotor.size / 2); cr.paint(); cr.restore();
            cr.setSourceSurface(rotor.cap, rotor.hubX, rotor.hubY); cr.paint();
        }
    }

    stormPower() {
        const time = this.time % 113;
        let best = {power: 0, x: 1209, y: 241};
        for (const event of Data.stormEvents) {
            const age = time - event.at;
            if (age < 0 || age > event.duration) continue;
            const pulse = (center, width, amplitude) => amplitude * Math.exp(-Math.pow((age - center) / width, 2));
            const power = event.power * this.weather * (pulse(.08, .055, 1) + pulse(.29, .09, .61) + pulse(.48, .16, .26));
            if (power > best.power) best = {...event, power};
        }
        return best;
    }

    drawStorm(cr) {
        const storm = this.stormPower();
        if (storm.power < .002) return;
        cr.save(); cr.rectangle(850, 100, 558, 230); cr.clip();
        cr.translate(storm.x, storm.y); cr.scale(165, 80);
        const glow = new Cairo.RadialGradient(0, 0, 0, 0, 0, 1.6);
        glow.addColorStopRGBA(0, .53, .60, .83, storm.power * .7);
        glow.addColorStopRGBA(.5, .53, .60, .83, storm.power * .36);
        glow.addColorStopRGBA(1, .53, .60, .83, 0);
        cr.setOperator(Cairo.Operator.SCREEN); cr.setSource(glow); cr.arc(0, 0, 1.6, 0, TAU); cr.fill(); cr.restore();
    }

    paint(cr, width, height) {
        cr.setOperator(Cairo.Operator.CLEAR); cr.paint(); cr.setOperator(Cairo.Operator.OVER);
        if (this.destroyed || width <= 0 || height <= 0) return;
        const scale = Math.max(width / Data.width, height / Data.height);
        cr.save(); cr.translate((width - Data.width * scale) / 2, (height - Data.height * scale) / 2); cr.scale(scale, scale);
        this.drawClouds(cr); this.drawStorm(cr); this.drawWindows(cr); this.drawBeacons(cr); this.drawTurbines(cr);
        cr.restore();
    }

    getDiagnostics() {
        return {scene: 'cloudcity', time: this.time, cloudSpeed: Data.cloudSpeed,
            cloudOffset: this.windTime * Data.cloudSpeed, coherentClouds: true, lowerLeft: 'original-photograph',
            circuits: this.circuits?.length ?? 0, beacons: Data.beacons.length, turbines: this.rotors?.length ?? 0,
            weather: this.weather, destroyed: this.destroyed};
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const surface of this.surfaces) surface.finish();
        this.surfaces = []; this.rotors = []; this.circuits = [];
        this.clouds = this.cloudMask = this.darkWindows = this.brightWindows = this.darkBeacons = null;
    }
}

export function createCloudcityRenderer(imagePath) { return new CloudcityRenderer(imagePath); }
