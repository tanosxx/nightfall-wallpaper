import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {SCENES, intensityLabels} from '../extension/nightfall@local/scene-catalog.js';
import {getScene} from '../extension/nightfall@local/scene-registry.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const expected = ['nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans'];
assert.deepEqual(SCENES.map(scene => scene.id), expected);
const schema = read('extension/nightfall@local/schemas/org.gnome.shell.extensions.nightfall.gschema.xml');
const selection = schema.match(/<key name="selected-scene"[\s\S]*?<\/key>/)[0];
assert.doesNotMatch(selection, /<choices>/, 'Installed package IDs must not be restricted to the built-in catalogue');
assert.match(selection, /<default>'nightfall'<\/default>/, 'Existing selection fallback must be preserved');
assert.match(schema, /name="library-revision" type="u"/, 'Package changes notify the running Shell');
for (const scene of SCENES) {
    assert.equal(getScene(scene.id), scene);
    assert.ok(existsSync(new URL(scene.image, root)), `${scene.id} source photograph is present`);
    assert.ok(existsSync(new URL(scene.page.split('?')[0], root)), `${scene.id} browser page is present`);
    assert.equal(scene.width, 1672);
    assert.equal(scene.height, 941);
    assert.ok(Object.isFrozen(scene));
}
assert.equal(getScene('unknown'), SCENES[0], 'Unknown saved selections retain a safe fallback');
assert.equal(intensityLabels(getScene('cloudcity'))[0], 'Минимальная');
assert.equal(intensityLabels(getScene('abyss'))[0], 'Минимальная');
assert.equal(intensityLabels(getScene('station'))[0], 'Перерыв');
assert.match(read('library.js'), /import \{SCENES\} from '\.\/extension\/nightfall@local\/scene-catalog\.js/);
assert.doesNotMatch(read('library.js'), /const scenes=\[/, 'The preview must not maintain another catalogue');
assert.match(read('index.html'), /<script type="module" src="library\.js/);
console.log('PASS: shared scenes, extensible saved selection, source images/pages and controls');
