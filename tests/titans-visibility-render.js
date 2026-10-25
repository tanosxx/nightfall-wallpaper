/* Actual native-composited visibility evidence. Render deterministic times and
 * preserve raw frames; use the companion analyser for regional temporal motion.
 * Run: gjs -m tests/titans-visibility-render.js [before|after|label]
 */
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createTitansRenderer} from '../extension/nightfall@local/titans-renderer.js';
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const label = ARGV[0] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Unsafe evidence label');
const output = root.resolve_relative_path(`validation/titans-visibility-${label}`).get_path();
GLib.mkdir_with_parents(output, 0o755);
const imagePath = root.resolve_relative_path('assets/titans.png').get_path();
const width = 1672, height = 941, times = [0, .5, 1, 2, 4, 6, 8];
const renderer = createTitansRenderer(imagePath);
const base = Cairo.ImageSurface.createFromPNG(imagePath);
const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
const cr = new Cairo.Context(layer);
const samples = [];
try {
  for (let index = 0; index < times.length; index++) {
    const target = times[index];
    while (renderer.time < target - 1e-9) renderer.update(Math.min(1 / 24, target - renderer.time), {}, 1);
    const start = GLib.get_monotonic_time();
    renderer.paint(cr, width, height);
    const millis = (GLib.get_monotonic_time() - start) / 1000;
    const composite = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const context = new Cairo.Context(composite);
    try {
      context.setSourceSurface(base, 0, 0); context.paint();
      context.setSourceSurface(layer, 0, 0); context.paint();
      composite.writeToPNG(`${output}/frame-${index}.png`);
      samples.push({index, time: target, renderMillis: millis, diagnostics: renderer.getDiagnostics()});
    } finally { context.$dispose(); composite.finish(); }
  }
  const start = GLib.get_monotonic_time();
  for (let i = 0; i < 48; i++) { renderer.update(1 / 24, {}, 1); renderer.paint(cr, width, height); }
  const renderMillisMean = (GLib.get_monotonic_time() - start) / 48000;
  const codePaths = ['extension/nightfall@local/titans-ground.js', 'extension/nightfall@local/titans-sky.js', 'extension/nightfall@local/titans-canvas.js'];
  const codeHashes = Object.fromEntries(codePaths.map(path => [path, GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, new GLib.Bytes(GLib.file_get_contents(root.resolve_relative_path(path).get_path())[1]))]));
  GLib.file_set_contents(`${output}/render.json`, JSON.stringify({label, dimensions:[width,height], intensity:1, renderMillisMean, codeHashes, samples}, null, 2));
  print(JSON.stringify({output, renderMillisMean, times}));
} finally { renderer.destroy(); cr.$dispose(); layer.finish(); base.finish(); }
