/* Actual Cairo frames from the same effect modules as the browser.
 * Run: gjs -m tests/titans-native.test.js [source photograph path]
 */
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createTitansRenderer} from '../extension/nightfall@local/titans-renderer.js';
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const imagePath = ARGV[0] ?? root.resolve_relative_path('assets/titans.png').get_path();
const output = GLib.dir_make_tmp('nightfall-titans-native-XXXXXX');
function assert(value, message) { if (!value) throw new Error(message); }
function bytes(path) { return GLib.file_get_contents(path)[1]; }
function identical(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
let renderer, base, layer, cr;
try {
    const startup = GLib.get_monotonic_time();
    renderer = createTitansRenderer(imagePath);
    print(`Startup milliseconds: ${(GLib.get_monotonic_time() - startup) / 1000}`);
    base = Cairo.ImageSurface.createFromPNG(imagePath);
    layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1672, 941); cr = new Cairo.Context(layer);
    function frame(name, width = 1672, height = 941) {
        renderer.paint(cr, width, height);
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height), ctx = new Cairo.Context(surface);
        try {
            const scale = Math.max(width / 1672, height / 941);
            ctx.save(); ctx.translate((width - 1672 * scale) / 2, (height - 941 * scale) / 2); ctx.scale(scale, scale);
            ctx.setSourceSurface(base, 0, 0); ctx.paint(); ctx.restore();
            ctx.setSourceSurface(layer, 0, 0); ctx.paint(); const path = `${output}/${name}.png`; surface.writeToPNG(path); return bytes(path);
        } finally { ctx.$dispose(); surface.finish(); }
    }
    let previous;
    for (const target of [0, 6, 20]) {
        while (renderer.time < target - 1e-9) renderer.update(Math.min(1 / 24, target - renderer.time), {}, 1);
        const current = frame(`frame-${target}`);
        if (previous) assert(!identical(previous, current), 'Scene has no frame-to-frame activity');
        previous = current;
        const diagnostic = renderer.getDiagnostics();
        GLib.file_set_contents(`${output}/diagnostics-${target}.json`, JSON.stringify(diagnostic, null, 2));
        print(JSON.stringify({time: diagnostic.time, intensity: diagnostic.intensity, assets: diagnostic.assets,
            fires: diagnostic.ground?.fireCount, smokePuffs: diagnostic.ground?.smoke?.length,
            salvageSites: diagnostic.ground?.salvage?.length, sky: {
                smokePuffs: diagnostic.sky?.smoke?.length, fragments: diagnostic.sky?.fragments?.length,
                explosions: diagnostic.sky?.explosions?.length, emissionRegions: diagnostic.sky?.emissionRegions}}));
    }
    renderer.update(0, {active: true, x: 0, y: 0}, 1);
    const pausedA = frame('paused-a');
    renderer.update(0, {active: true, x: 1, y: 1}, 1);
    const pausedB = frame('paused-b');
    assert(identical(pausedA, pausedB), 'Pause or cursor changes the rendered frame');
    const time = renderer.time;
    for (const dt of [NaN, Infinity, -1]) renderer.update(dt, {}, 1);
    assert(renderer.time === time, 'Invalid update changes time');
    renderer.update(10, {}, 1);
    assert(Math.abs(renderer.time - time - .1) < 1e-9, 'Stalled frame was not clamped');
    renderer.update(0, {}, 0);
    const low = frame('low-activity');
    renderer.update(0, {}, 0);
    assert(identical(low, frame('low-activity-paused')), 'Low activity pause is unstable');
    renderer.update(0, {}, 1);
    frame('portrait', 800, 941);
    frame('wide-after-resize');
    const start = GLib.get_monotonic_time();
    for (let index = 0; index < 72; index++) { renderer.update(1 / 24, {}, 1); renderer.paint(cr, 1672, 941); }
    const mean = (GLib.get_monotonic_time() - start) / 72000;
    print(`72 full-size frames: mean ${mean.toFixed(2)} ms/frame`);
    const clockBeforeDispose = renderer.time;
    renderer.destroy(); renderer.destroy(); renderer.update(.1, {}, 1); renderer.paint(cr, 1672, 941);
    assert(renderer.getDiagnostics().destroyed && renderer.getDiagnostics().assets === 0 && renderer.time === clockBeforeDispose,
        'Destroyed renderer retains resources or advances');
    print(`PASS: native frame motion, exact pause, ignored pointer, low activity, resized canvas, delta clamp and disposal. Evidence: ${output}`);
} finally { renderer?.destroy(); cr?.$dispose(); layer?.finish(); base?.finish(); }
