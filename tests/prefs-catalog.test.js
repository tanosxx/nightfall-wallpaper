// Requires GTK4/libadwaita and a display (xvfb-run is suitable in CI).
// Uses real widgets, a memory settings backend and a fake manager; no install,
// network request, live GNOME settings or extension activation is performed.
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

function assert(value, message) { if (!value) throw new Error(message); }
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const source = root.resolve_relative_path('extension/nightfall@local');
const temporary = GLib.dir_make_tmp('nightfall-prefs-test-XXXXXX');
const decoder = new TextDecoder();
const [, bytes] = GLib.file_get_contents(source.resolve_relative_path('prefs.js').get_path());
const module = decoder.decode(bytes)
    .replace("import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';",
        'class ExtensionPreferences {}')
    .replaceAll("from './", `from '${source.get_uri()}/`);
GLib.file_set_contents(`${temporary}/prefs.js`, module);
source.resolve_relative_path('schemas/org.gnome.shell.extensions.nightfall.gschema.xml')
    .copy(Gio.File.new_for_path(`${temporary}/org.gnome.shell.extensions.nightfall.gschema.xml`),
        Gio.FileCopyFlags.NONE, null, null);
const [, , , status] = GLib.spawn_sync(null, ['glib-compile-schemas', temporary], null,
    GLib.SpawnFlags.SEARCH_PATH, null);
assert(status === 0, 'Could not compile isolated preferences schema');
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const schemas = Gio.SettingsSchemaSource.new_from_directory(temporary,
    Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: schemas.lookup('org.gnome.shell.extensions.nightfall', true)});
const {buildPreferences} = await import(Gio.File.new_for_path(`${temporary}/prefs.js`).get_uri());
const city = {id: 'nightfall', name: 'City', subtitle: 'City fixture', description: 'Description',
    image: 'missing.png', root: temporary, bundled: true, version: 1,
    control: 'weather', weatherLabel: 'Дождь'};
const polar = {id: 'polar', name: '<b>Literal title</b>', subtitle: 'Polar fixture',
    description: 'Description', author: '<em>Author</em>', license: 'GPL-3.0-only',
    image: 'missing.png', root: temporary, bundled: false, version: 1,
    control: 'weather', weatherLabel: 'Снег', package: {bytes: 23000}};
let installed = [city];
const calls = [];
let refreshFailure = false;
let pendingInstall = false;
let commitBeforeCancellation = false;
let cancelled = false;
let cancelAll = false;
let deferPreview = true;
let previewRunning = false;
let previewCancelled = false;
const client = {
    run(command, ...args) {
        calls.push([command, ...args]);
        let rejectPending;
        let promise;
        if (command === 'refresh') promise = refreshFailure
            ? Promise.reject(new Error('Offline fixture'))
            : Promise.resolve({catalog: {scenes: [polar]}, cached: false});
        else if (command === 'preview' && deferPreview) {
            previewRunning = true;
            promise = new Promise((_resolve, reject) => { rejectPending = reject; });
        } else if (command === 'preview') promise = Promise.resolve({path: '/missing-preview'});
        else if (command === 'install' && pendingInstall) {
            if (commitBeforeCancellation)
                installed = [city, polar];
            promise = new Promise((_resolve, reject) => { rejectPending = reject; });
        }
        else if (command === 'install') {
            assert(!previewRunning, 'An installation must wait until the preview child has released its lock');
            installed = [city, polar];
            promise = Promise.resolve({ok: true});
        } else if (command === 'remove') {
            assert(settings.get_string('selected-scene') === 'nightfall', 'Removing the active scene must first select the city');
            installed = [city];
            promise = Promise.resolve({ok: true});
        } else throw new Error(`Unexpected command: ${command}`);
        return {promise, cancel() {
            cancelled = true;
            if (command === 'preview') {
                previewRunning = false;
                previewCancelled = true;
            }
            const error = new Error('Операция отменена.'); error.cancelled = true;
            rejectPending?.(error);
        }};
    },
    cancelAll() { cancelAll = true; },
};
const tick = () => new Promise(resolve => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function widgets(widget, all = []) {
    all.push(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        widgets(child, all);
    return all;
}
function button(label, page = window.visible_page) {
    const found = widgets(page).find(widget => widget instanceof Gtk.Button && widget.label === label);
    assert(found, `Missing button: ${label}`);
    return found;
}
function click(label) { button(label).emit('clicked'); }
function labels(page = window.visible_page) { return widgets(page).filter(widget => widget instanceof Gtk.Label); }
Adw.init();
const window = new Adw.PreferencesWindow();
buildPreferences(window, settings, temporary, {client,
    listAvailableScenes: () => installed,
    getAvailableScene: id => installed.find(scene => scene.id === id) ?? city});
assert(calls.length === 0, 'Opening installed scenes must not access the network');
assert(!widgets(window.visible_page).some(widget => widget instanceof Gtk.Button && widget.label === 'Удалить'),
    'The bundled scene cannot be removed');
window.visible_page_name = 'catalog';
await tick(); await tick();
assert(calls.some(([command]) => command === 'refresh'), 'Opening catalogue must load its index');
const literalTitle = labels().find(label => label.label === polar.name);
assert(literalTitle && !literalTitle.use_markup, 'Remote labels must remain literal text');
assert(previewRunning, 'Fixture must hold an in-flight preview operation');
deferPreview = false;
click('Скачать');
await tick(); await tick();
assert(previewCancelled, 'A user download must cancel and reap the in-flight preview');
assert(settings.get_uint('library-revision') === 1, 'Install must notify Shell to rescan scenes');
installed = [city, {...polar, version: 2}];
settings.set_uint('library-revision', 2);
await tick();
assert(!widgets(window.visible_page).some(widget => widget instanceof Gtk.Button && widget.label === 'Обновить сцену'),
    'A newer locally installed version must not be offered a downgrade');
window.visible_page_name = 'installed';
click('Выбрать');
assert(settings.get_string('selected-scene') === 'polar', 'Downloaded scene must be selectable');
click('Удалить');
await tick(); await tick();
assert(settings.get_uint('library-revision') === 3, 'Removal must notify Shell');
assert(settings.get_string('selected-scene') === 'nightfall', 'Deleted scene must not remain active');
window.visible_page_name = 'catalog';
refreshFailure = true;
click('Обновить');
await tick(); await tick();
assert(labels().some(label => label.label === 'Offline fixture'), 'A refresh error must remain visible');
assert(button('Обновить').sensitive, 'Retry must be available after a failed refresh');
refreshFailure = false;
pendingInstall = true;
click('Скачать');
assert(!button('Обновить').sensitive, 'Mutations must serialize while downloading');
click('Отменить');
await tick(); await tick();
assert(cancelled && button('Скачать').sensitive, 'Cancel must restore available actions');
assert(settings.get_uint('library-revision') === 3, 'Cancelled installation must not notify a false success');
commitBeforeCancellation = true;
click('Скачать');
assert(settings.get_uint('library-revision') === 3, 'A missing child response must not be treated as success yet');
click('Отменить');
await tick(); await tick();
assert(settings.get_uint('library-revision') === 4,
    'Cancellation after an atomic commit must rescan the actual installed state');
assert(labels().some(label => label.label === 'Изменение уже сохранено. Список установленных сцен обновлён.'),
    'A late cancellation must tell the user that the completed change is present');
window.visible_page_name = 'installed';
assert(button('Удалить').sensitive, 'A scene committed before cancellation must appear in the installed library');
window.emit('close-request');
assert(cancelAll && window._nightfallSettings === null, 'Closing preferences must release operations and settings');
window.destroy();
for (const name of ['prefs.js', 'org.gnome.shell.extensions.nightfall.gschema.xml', 'gschemas.compiled'])
    GLib.unlink(`${temporary}/${name}`);
GLib.rmdir(temporary);
print('PASS native prefs: lazy catalogue, literal metadata, preview priority, install/select/remove, downgrade guard, offline retry, cancellation before and after commit');
