/* Real packaged-desktop smoke test, independent of source-tree asset copies.
 * Usage: gjs -m tests/desktop-bundle.test.js /absolute/path/to/staged/extension
 * Keeps composite PNG evidence in a newly created /tmp directory. */
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const expected = ['nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans'];
const pointer = Object.freeze({x: .5, y: .5, active: false});
function assert(condition, message) { if (!condition) throw new Error(message); }
assert(ARGV.length === 1 && GLib.path_is_absolute(ARGV[0]),
    'Usage: gjs -m tests/desktop-bundle.test.js /absolute/path/to/staged/extension');
const stage = Gio.File.new_for_path(ARGV[0]);
assert(stage.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY,
    `Staging directory does not exist: ${ARGV[0]}`);
const registryFile = stage.resolve_relative_path('scene-registry.js');
assert(registryFile.query_exists(null), 'The supplied stage has no scene-registry.js');
const {SCENES, getScene, createRenderer} = await import(registryFile.get_uri());
const {getAvailableScene} = await import(stage.resolve_relative_path('installed-scenes.js').get_uri());
assert(JSON.stringify(SCENES.map(scene => scene.id)) === JSON.stringify(expected),
    'The packaged catalogue must contain all seven scenes in their expected order');
assert(getScene('invalid-scene').id === 'nightfall', 'Invalid scene fallback is broken');

const outputDirectory = GLib.dir_make_tmp('nightfall-desktop-bundle-XXXXXX');
print(`Packaged scene evidence: ${outputDirectory}`);

function encodedFrame(path) {
    // Cairo produces deterministic PNGs without timestamps. Comparing its
    // bytes requires no display, session bus or external image-loader service.
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok && bytes.length > 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
        `Cairo failed to produce a PNG frame: ${path}`);
    const integer = offset => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    return {width: integer(16), height: integer(20), bytes};
}

function difference(a, b) {
    assert(a.width === b.width && a.height === b.height, 'Frame dimensions differ');
    let changedBytes = 0;
    for (let index = 0; index < Math.max(a.bytes.length, b.bytes.length); index++) {
        if (a.bytes[index] !== b.bytes[index]) changedBytes++;
    }
    return {changedBytes, initialBytes: a.bytes.length, finalBytes: b.bytes.length};
}

for (const scene of SCENES) {
    let renderer = null, base = null;
    const contexts = [], surfaces = [];
    const started = GLib.get_monotonic_time();
    try {
        assert(getScene(scene.id) === scene, `${scene.id}: registry lookup disagrees with catalogue`);
        const installed = getAvailableScene(scene.id, stage.get_path());
        assert(installed.id === scene.id, `${scene.id}: package was not installed in the test library`);
        const image = Gio.File.new_for_path(`${installed.root}/${installed.image}`);
        assert(image.query_exists(null), `${scene.id}: missing packaged photograph ${scene.image}`);
        base = Cairo.ImageSurface.createFromPNG(image.get_path());
        renderer = await createRenderer(scene.id, installed.root, installed);
        for (const method of ['update', 'paint', 'destroy'])
            assert(typeof renderer[method] === 'function', `${scene.id}: missing ${method} contract`);
        // A renderer may finish asynchronous preparation before its first paint.
        if (renderer.ready) await renderer.ready;
        renderer.update(0, pointer, 1);

        function target(width, height) {
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
            const context = new Cairo.Context(surface);
            surfaces.push(surface); contexts.push(context);
            return {surface, context, width, height};
        }

        function frame(destination, name) {
            renderer.paint(destination.context, destination.width, destination.height);
            const composite = new Cairo.ImageSurface(Cairo.Format.ARGB32, destination.width, destination.height);
            const context = new Cairo.Context(composite);
            try {
                const scale = Math.max(destination.width / scene.width, destination.height / scene.height);
                context.save();
                context.translate((destination.width - scene.width * scale) / 2,
                    (destination.height - scene.height * scale) / 2);
                context.scale(scale, scale); context.setSourceSurface(base, 0, 0); context.paint(); context.restore();
                context.setSourceSurface(destination.surface, 0, 0); context.paint();
                const path = `${outputDirectory}/${scene.id}-${name}.png`;
                composite.writeToPNG(path);
                return encodedFrame(path);
            } finally { context.$dispose(); composite.finish(); }
        }

        const normal = target(1672, 941);
        const initial = frame(normal, 'initial');
        for (let i = 0; i < 144; i++) renderer.update(1 / 24, pointer, 1);
        const active = frame(normal, 'active-6s');
        const motion = difference(initial, active);
        assert(motion.changedBytes > 50,
            `${scene.id}: packaged scene appears static after six seconds: ${JSON.stringify(motion)}`);

        renderer.update(0, pointer, 1);
        const paused = frame(normal, 'paused');
        const pause = difference(active, paused);
        assert(pause.changedBytes === 0,
            `${scene.id}: update(0) changes the visible paused frame: ${JSON.stringify(pause)}`);

        // Exercise crop/scale, control changes and another pause at square size.
        const square = target(1000, 1000);
        renderer.update(1 / 24, pointer, 0);
        const squareActive = frame(square, 'square-low-control');
        renderer.update(0, pointer, 0);
        const squarePaused = frame(square, 'square-paused');
        const squarePause = difference(squareActive, squarePaused);
        assert(squarePause.changedBytes === 0,
            `${scene.id}: update(0) changes the resized paused frame: ${JSON.stringify(squarePause)}`);

        // Paint the original monitor again after changing sizes. This catches
        // invalidated caches and verifies the one-renderer/many-monitors model.
        renderer.update(0, pointer, 1);
        frame(normal, 'returned-to-wide');
        print(JSON.stringify({scene: scene.id, result: 'PASS', sizes: [[1672, 941], [1000, 1000]],
            motion, pauseExact: true, resizedPauseExact: true,
            elapsedMilliseconds: (GLib.get_monotonic_time() - started) / 1000}));
    } finally {
        try { renderer?.destroy(); }
        finally {
            for (const context of contexts) context.$dispose();
            for (const surface of surfaces) surface.finish();
            base?.finish();
        }
    }
}
print(`PASS: all seven packaged renderers load, animate, pause, resize and destroy. Frames: ${outputDirectory}`);
