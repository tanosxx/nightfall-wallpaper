/* Native evidence for the smoke, suit activity and unchanged distant planet. Run with a label;
 * frames use the real complete renderer, including its masks and transforms. */
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const {createTitansRenderer} = await import(ARGV[1]
    ? Gio.File.new_for_path(ARGV[1]).get_uri()
    : '../extension/nightfall@local/titans-renderer.js');
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const label = ARGV[0] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Unsafe evidence label');
const folder = root.resolve_relative_path(`validation/titans-additions-${label}`).get_path();
GLib.mkdir_with_parents(folder, 0o755);
const path = ARGV[2] ?? root.resolve_relative_path('assets/titans.png').get_path();
const width = 1672, height = 941;
const intensity = Number(GLib.getenv('TITANS_QA_INTENSITY') ?? 1);
if (!(intensity >= 0 && intensity <= 1)) throw new Error('Invalid QA intensity');
const times = JSON.parse(GLib.getenv('TITANS_QA_TIMES') ?? '[0,1,3,6,12,20]');
if (!Array.isArray(times) || !times.length || !times.every((t,i) => Number.isFinite(t) && t >= 0 && (!i || t > times[i-1])))
    throw new Error('Invalid QA times');
const benchmarkFrames = Number(GLib.getenv('TITANS_QA_BENCH_FRAMES') ?? 72);
if (!Number.isInteger(benchmarkFrames) || benchmarkFrames < 0 || benchmarkFrames > 300) throw new Error('Invalid QA benchmark length');
const renderer = createTitansRenderer(path);
renderer.update(0, {}, intensity);
const base = Cairo.ImageSurface.createFromPNG(path);
const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
const composite = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
const cr = new Cairo.Context(layer), output = new Cairo.Context(composite);
function assert(condition, message) { if (!condition) throw new Error(message); }
function frame(name) {
    renderer.paint(cr, width, height);
    output.setOperator(Cairo.Operator.SOURCE); output.setSourceSurface(base, 0, 0); output.paint();
    output.setOperator(Cairo.Operator.OVER); output.setSourceSurface(layer, 0, 0); output.paint();
    const file = `${folder}/${name}.png`; composite.writeToPNG(file);
    return GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, new GLib.Bytes(GLib.file_get_contents(file)[1]));
}
const samples = [];
try {
    for (const time of times) {
        while (renderer.time < time - 1e-9) renderer.update(Math.min(1 / 24, time - renderer.time), {}, intensity);
        const start = GLib.get_monotonic_time();
        const hash = frame(`frame-${time}`);
        samples.push({time, hash, diagnostics: renderer.getDiagnostics(),
            renderAndSaveMillis: (GLib.get_monotonic_time() - start) / 1000});
    }
    const pauseTime = renderer.time;
    renderer.update(0, {active: true, x: 0, y: 0}, intensity);
    const paused = frame('paused-a');
    renderer.update(0, {active: true, x: 1, y: 1}, intensity);
    assert(paused === frame('paused-b'), 'Paused native effects changed with cursor position');
    assert(pauseTime === renderer.time, 'Painting or paused update advances time');
    const durations = [];
    for (let i = 0; i < benchmarkFrames; i++) {
        renderer.update(1 / 24, {}, intensity);
        const start = GLib.get_monotonic_time(); renderer.paint(cr, width, height);
        durations.push((GLib.get_monotonic_time() - start) / 1000);
    }
    durations.sort((a, b) => a - b);
    const resourcesBeforeDispose = renderer.getDiagnostics().assets;
    renderer.destroy(); renderer.destroy();
    assert(renderer.getDiagnostics().assets === 0, 'Native scene assets were not released');
    const report = {label, dimensions: [width, height], intensity, times, samples,
        pauseExact: true, pointerIgnored: true, disposed: true, resourcesBeforeDispose,
        frameMillis: durations.length ? {frames: durations.length,
            mean: durations.reduce((a, b) => a + b, 0) / durations.length,
            p50: durations[Math.floor(durations.length * .5)],
            p95: durations[Math.floor(durations.length * .95)], max: durations.at(-1)} : null};
    GLib.file_set_contents(`${folder}/render.json`, JSON.stringify(report, null, 2));
    print(JSON.stringify({folder, ...report, samples: undefined}));
} finally {
    renderer.destroy(); cr.$dispose(); output.$dispose(); layer.finish(); composite.finish(); base.finish();
}
