// Local data only. Networking and archive installation run in preferences.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {SCENES} from './scene-catalog.js';

const RENDERERS = new Set(SCENES.map(scene => scene.id));
const ID = /^[a-z][a-z0-9-]{0,63}$/;

function regular(path, maximum = 2 * 1024 * 1024) {
    const info = Gio.File.new_for_path(path).query_info('standard::type,standard::size',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    return info.get_file_type() === Gio.FileType.REGULAR && info.get_size() <= maximum;
}

function readJson(path) {
    if (!regular(path)) throw new Error('Invalid local scene metadata');
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok) throw new Error('Cannot read local scene metadata');
    return JSON.parse(new TextDecoder().decode(bytes));
}

function directory(path) {
    return Gio.File.new_for_path(path).query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
        === Gio.FileType.DIRECTORY;
}

export function sceneStorePath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'nightfall', 'scenes']);
}

export function listAvailableScenes(extensionPath) {
    const available = new Map();
    for (const scene of SCENES) {
        const image = GLib.build_filenamev([extensionPath, scene.image]);
        try {
            if (regular(image, 128 * 1024 * 1024))
                available.set(scene.id, {...scene, renderer: scene.id, version: 1,
                    root: extensionPath, bundled: true});
        } catch { /* A slim installation bundles only the first scene. */ }
    }
    const store = sceneStorePath();
    try {
        if (!directory(GLib.path_get_dirname(store)) || !directory(store))
            return [...available.values()];
        const registry = readJson(`${store}/registry.json`);
        if (registry.formatVersion !== 1 || !Array.isArray(registry.scenes) || registry.scenes.length > 200)
            throw new Error('Unsupported local scene registry');
        for (const entry of registry.scenes) {
            try {
                if (!ID.test(entry.id) || !Number.isSafeInteger(entry.version) || entry.version < 1)
                    continue;
                const parent = `${store}/${entry.id}`, root = `${parent}/${entry.version}`;
                if (!directory(parent) || !directory(root) || !directory(`${root}/assets`)) continue;
                const scene = readJson(`${root}/scene.json`);
                if (scene.formatVersion !== 1 || scene.id !== entry.id || scene.version !== entry.version ||
                    !RENDERERS.has(scene.renderer) || !/^assets\/[a-zA-Z0-9_-]+\.png$/.test(scene.image) ||
                    scene.width !== 1672 || scene.height !== 941 ||
                    !['weather', 'flow', 'activity'].includes(scene.control) ||
                    !['name', 'subtitle', 'description', 'weatherLabel', 'author', 'license'].every(key =>
                        typeof scene[key] === 'string' && scene[key].length <= 4000) ||
                    !regular(`${root}/${scene.image}`, 128 * 1024 * 1024)) continue;
                // Local paths are derived here; never accept paths from JSON.
                available.set(scene.id, {...scene, root, bundled: false});
            } catch { /* One damaged pack must not hide the remaining library. */ }
        }
    } catch { /* First launch/offline/corrupt registry keeps the built-in scene. */ }
    return [...available.values()];
}

export function getAvailableScene(id, extensionPath) {
    const scenes = listAvailableScenes(extensionPath);
    return scenes.find(scene => scene.id === id) ?? scenes.find(scene => scene.id === 'nightfall')
        ?? {...SCENES[0], renderer: 'nightfall', root: extensionPath, bundled: true, version: 1};
}
