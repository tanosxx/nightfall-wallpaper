import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createCloudcityRenderer} from '../extension/nightfall@local/cloudcity-renderer.js';

const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().resolve_relative_path('assets/cloudcity.png').get_path();
const renderer = createCloudcityRenderer(path);
const base = Cairo.ImageSurface.createFromPNG(path);
const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1672, 941);
const cr = new Cairo.Context(layer);
function assert(condition, message) { if (!condition) throw new Error(message); }
function saveComposite(name) {
    renderer.paint(cr, 1672, 941);
    const frame = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1672, 941), context = new Cairo.Context(frame);
    context.setSourceSurface(base, 0, 0); context.paint(); context.setSourceSurface(layer, 0, 0); context.paint();
    frame.writeToPNG(`/tmp/nightfall-cloudcity-native-${name}.png`); context.$dispose(); frame.finish();
}
for (const target of [0, 60, 600]) {
    while (renderer.time < target - .00001) renderer.update(Math.min(.1, target - renderer.time), {}, 1);
    saveComposite(target);
    const diagnostic = renderer.getDiagnostics();
    assert(Math.abs(diagnostic.cloudOffset - target * .85) < .001, 'Cloud velocity changed or accumulated shear');
    assert(diagnostic.circuits > 100 && diagnostic.beacons === 22 && diagnostic.turbines === 2, 'Incomplete scene activity');
    print(JSON.stringify(diagnostic));
}
const paused = renderer.time;
renderer.update(0, {x: 0, y: 0, active: true}, 0); saveComposite('paused-a');
renderer.update(0, {x: 1, y: 1, active: true}, 0); saveComposite('paused-b');
assert(renderer.time === paused, 'Paused time advanced');
renderer.update(Number.NaN, {}, Number.NaN); assert(renderer.time === paused, 'Invalid delta changed time');
renderer.time = 6.48; renderer.update(0, {}, 1); assert(renderer.stormPower().power > .1, 'No horizon lightning');
renderer.update(0, {}, 0); assert(renderer.stormPower().power === 0, 'Weather control does not suppress lightning');
const previousWind = renderer.windTime;
renderer.update(.1, {}, 0);
assert(Math.abs(renderer.windTime - previousWind - .04) < .00001, 'Low wind does not reduce coherent cloud/turbine speed');
const start = GLib.get_monotonic_time();
for (let i = 0; i < 48; i++) { renderer.update(1 / 24, {}, 1); renderer.paint(cr, 1672, 941); }
print('48 frames mean ms: ' + ((GLib.get_monotonic_time() - start) / 48000).toFixed(2));
renderer.paint(cr, 1000, 1000);
renderer.destroy(); renderer.destroy(); renderer.update(.1, {}, 1); renderer.paint(cr, 1672, 941);
assert(renderer.getDiagnostics().destroyed && renderer.surfaces.length === 0, 'Scene surfaces not disposed');
cr.$dispose(); layer.finish(); base.finish();
print('Cloudcity native update/paint/weather/pause/aspect/dispose PASS');
