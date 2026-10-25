/* Native full-scene playback for visual review of the requested additions. */
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createTitansRenderer} from '../extension/nightfall@local/titans-renderer.js';
const folder = GLib.dir_make_tmp('nightfall-titans-additions-video-XXXXXX');
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const path = root.resolve_relative_path('assets/titans.png').get_path();
const renderer = createTitansRenderer(path);
const width = 1280, height = 720, fps = 24, duration = 12, frames = fps * duration;
const base = Cairo.ImageSurface.createFromPNG(path);
const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
const final = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
const lc = new Cairo.Context(layer), fc = new Cairo.Context(final);
const scale = Math.max(width / 1672, height / 941);
let maxResources = 0;
try {
    for (let frame = 0; frame < frames; frame++) {
        renderer.paint(lc, width, height);
        fc.save(); fc.setOperator(Cairo.Operator.SOURCE);
        fc.translate((width - 1672 * scale) / 2, (height - 941 * scale) / 2); fc.scale(scale, scale);
        fc.setSourceSurface(base, 0, 0); fc.paint(); fc.restore();
        fc.setOperator(Cairo.Operator.OVER); fc.setSourceSurface(layer, 0, 0); fc.paint();
        final.writeToPNG(`${folder}/frame-${String(frame).padStart(4, '0')}.png`);
        maxResources = Math.max(maxResources, renderer.getDiagnostics().assets);
        renderer.update(1 / fps, {}, 1);
    }
    renderer.destroy();
    print(JSON.stringify({folder, frames, width, height, fps, startTime: 0, duration,
        maxOwnedSurfaces: maxResources, remainingOwnedSurfaces: renderer.getDiagnostics().assets}));
} finally {
    renderer.destroy(); lc.$dispose(); fc.$dispose(); base.finish(); layer.finish(); final.finish();
}
