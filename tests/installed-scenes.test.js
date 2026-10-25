// Must run in a temporary XDG_DATA_HOME, never the live user library.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const stage = ARGV[0];
const data = GLib.get_user_data_dir();
if (!data.startsWith('/tmp/nightfall-')) throw new Error('Use a disposable XDG_DATA_HOME');
const {listAvailableScenes, getAvailableScene, sceneStorePath} = await import(
    Gio.File.new_for_path(`${stage}/installed-scenes.js`).get_uri());
const {createRenderer} = await import(Gio.File.new_for_path(`${stage}/scene-registry.js`).get_uri());
function check(value, message) { if (!value) throw new Error(message); }
check(listAvailableScenes(stage).map(s => s.id).join() === 'nightfall', 'Slim package must contain one offline scene');
const store = sceneStorePath();
const root = `${store}/community-city/1`;
GLib.mkdir_with_parents(`${root}/assets`, 0o700);
Gio.File.new_for_path(`${stage}/assets/city.png`).copy(Gio.File.new_for_path(`${root}/assets/city.png`),
    Gio.FileCopyFlags.NONE, null, null);
const metadata = {formatVersion: 1, id: 'community-city', version: 1, renderer: 'nightfall',
    name: 'Community city', subtitle: 'Test', description: 'Test', weatherLabel: 'Rain',
    author: 'Test', license: 'GPL-3.0-only', image: 'assets/city.png', control: 'weather',
    width: 1672, height: 941, root: '/outside', files: {}};
GLib.file_set_contents(`${root}/scene.json`, JSON.stringify(metadata));
GLib.file_set_contents(`${store}/registry.json`, JSON.stringify({formatVersion: 1,
    scenes: [{id: 'community-city', version: 1}, {id: '../../outside', version: 1},
        {id: 'bad-version', version: '1'}]}));
const scenes = listAvailableScenes(stage);
check(scenes.length === 2, 'Malformed records must not hide valid installed scenes');
const scene = getAvailableScene('community-city', stage);
check(scene.root === root && !scene.bundled, 'Scene root must be derived, not trusted from metadata');
const renderer = await createRenderer(scene.id, scene.root, scene);
renderer.update(1 / 24, {x: .5, y: .5, active: false}, 1);
renderer.destroy();
check(getAvailableScene('missing-pack', stage).id === 'nightfall', 'Missing selected package must have a safe fallback');
GLib.file_set_contents(`${root}/scene.json`, JSON.stringify({...metadata, renderer: '../../untrusted'}));
check(listAvailableScenes(stage).length === 1, 'Unknown renderer must not be loaded');
GLib.unlink(`${store}/registry.json`);
print('PASS: slim offline start, dynamic IDs, local roots, invalid records and fallback');
