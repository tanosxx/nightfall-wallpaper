import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {STATION_MODES, createRenderer} from './scene-registry.js';
import {listAvailableScenes} from './installed-scenes.js';
import {intensityLabels} from './scene-catalog.js';

const FRAME_MS = 42; // At most 24 frames/second.
const NEUTRAL_POINTER = Object.freeze({x: 0.5, y: 0.5, active: false});

export default class NightfallExtension extends Extension {
    enable() {
        this._enabled = true;
        this._actors = [];
        this._connections = [];
        this._timerId = 0;
        // Keep generations monotonic even if Shell reuses this instance after
        // disable/enable while an earlier dynamic import is still pending.
        this._loadGeneration = (this._loadGeneration ?? 0) + 1;
        this._loading = false;
        this._lastTick = 0;
        this._renderError = false;
        this._renderer = null;
        this._scene = null;
        this._indicator = null;
        this._updatingMenu = false;

        try {
            this._settings = this.getSettings();
            this._scenes = listAvailableScenes(this.path);
            this._weather = this._settings.get_double('weather');
            this._createIndicator();
            this._connect(this._settings, 'changed::library-revision', () => {
                this._scenes = listAvailableScenes(this.path);
                this._populateSceneMenu();
                this._loadScene();
            });
            this._connect(this._settings, 'changed::selected-scene', () => this._loadScene());
            this._connect(this._settings, 'changed::background-enabled', () => this._loadScene());
            this._connect(this._settings, 'changed::station-mode', () => {
                if (this._scene?.renderer === 'station' && this._renderer && !this._renderError) {
                    try {
                        this._renderer.setMode(this._settings.get_string('station-mode'), this._settings.get_boolean('paused'));
                        this._renderer.update(0, NEUTRAL_POINTER, this._weather);
                        for (const {overlay} of this._actors)
                            overlay.queue_repaint();
                    } catch (error) {
                        this._reportRenderError(error);
                    }
                }
                this._syncMenu();
            });
            this._connect(this._settings, 'changed::paused', () => {
                this._syncMenu();
                this._syncPlayback();
            });
            this._connect(this._settings, 'changed::weather', () => {
                this._weather = this._settings.get_double('weather');
                if (this._renderer && !this._renderError) {
                    try {
                        this._renderer.update(0, NEUTRAL_POINTER, this._weather);
                        for (const {overlay} of this._actors)
                            overlay.queue_repaint();
                    } catch (error) {
                        this._reportRenderError(error);
                    }
                }
                this._syncMenu();
            });
            this._connect(Main.layoutManager, 'monitors-changed', () => this._rebuild());
            this._connect(Main.sessionMode, 'updated', () => {
                this._syncMenu();
                this._syncPlayback();
            });
            this._connect(Main.overview, 'showing', () => this._syncPlayback());
            this._connect(Main.overview, 'hidden', () => this._syncPlayback());
            if (Main.layoutManager._startingUp)
                this._connect(Main.layoutManager, 'startup-complete', () => this._rebuild());
            this._loadScene();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _connect(object, signal, callback) {
        this._connections.push([object, object.connect(signal, callback)]);
    }

    _createIndicator() {
        this._indicator = new PanelMenu.Button(0.0, 'Nightfall', false);
        this._icon = new St.Icon({
            icon_name: 'weather-clear-night-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        const menu = this._indicator.menu;
        this._statusItem = new PopupMenu.PopupMenuItem('Nightfall', {reactive: false});
        menu.addMenuItem(this._statusItem);
        this._sceneSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this._sceneSection);
        this._populateSceneMenu();
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._backgroundItem = new PopupMenu.PopupSwitchMenuItem('Живые обои', true);
        this._backgroundItem.connect('toggled', (_item, state) => {
            if (!this._updatingMenu)
                this._settings.set_boolean('background-enabled', state);
        });
        menu.addMenuItem(this._backgroundItem);
        this._pauseItem = new PopupMenu.PopupSwitchMenuItem('Пауза', false);
        this._pauseItem.connect('toggled', (_item, state) => {
            if (!this._updatingMenu)
                this._settings.set_boolean('paused', state);
        });
        menu.addMenuItem(this._pauseItem);
        this._weatherItem = new PopupMenu.PopupSubMenuMenuItem('Осадки');
        this._weatherChoices = [
            [0, 'Без осадков'], [0.35, 'Слабые'], [1, 'Обычные'],
        ].map(([value, label]) => ({
            value,
            item: this._weatherItem.menu.addAction(label, () => this._settings.set_double('weather', value)),
        }));
        menu.addMenuItem(this._weatherItem);
        this._modeItem = new PopupMenu.PopupSubMenuMenuItem('Режим станции');
        this._modeChoices = STATION_MODES.map(mode => ({
            ...mode,
            item: this._modeItem.menu.addAction(mode.name, () => this._settings.set_string('station-mode', mode.id)),
        }));
        menu.addMenuItem(this._modeItem);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._libraryItem = menu.addAction('Библиотека и каталог…', () => this.openPreferences());
        this._syncMenu();
    }

    _populateSceneMenu() {
        this._sceneSection.removeAll();
        this._sceneItems = new Map();
        for (const scene of this._scenes) {
            const item = this._sceneSection.addAction(scene.name, () => {
                this._settings.set_string('selected-scene', scene.id);
                this._settings.set_boolean('background-enabled', true);
                // Selecting an already selected scene also retries a failed load.
                if (this._renderError && !this._loading)
                    this._loadScene();
            });
            this._sceneItems.set(scene.id, item);
        }
    }

    _selectedScene() {
        return this._scenes.find(scene => scene.id === this._settings.get_string('selected-scene'))
            ?? this._scenes.find(scene => scene.id === 'nightfall') ?? this._scenes[0];
    }

    _syncMenu() {
        if (!this._settings || !this._indicator)
            return;
        this._updatingMenu = true;
        const enabled = this._settings.get_boolean('background-enabled');
        const paused = this._settings.get_boolean('paused');
        const scene = this._selectedScene();
        if (!scene) { this._updatingMenu = false; return; }
        this._statusItem.label.text = this._loading ? 'Загрузка сцены…'
            : this._renderError ? 'Сцена недоступна' : 'Nightfall';
        this._indicator.accessible_name = `Nightfall: ${enabled ? scene.name : 'Обычные обои'}`;
        for (const [id, item] of this._sceneItems)
            item.setOrnament(id === scene.id ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        this._backgroundItem.setToggleState(enabled);
        this._pauseItem.setToggleState(paused);
        this._pauseItem.setSensitive(enabled && !this._loading && !this._renderError);
        this._weatherItem.label.text = `${scene.weatherLabel}: ${Math.round(this._weather * 100)}%`;
        this._weatherItem.setSensitive(enabled);
        const choiceLabels = intensityLabels(scene);
        for (const [index, {value, item}] of this._weatherChoices.entries()) {
            item.label.text = choiceLabels[index];
            item.setOrnament(Math.abs(value - this._weather) < 0.001 ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        const modeId = this._settings.get_string('station-mode');
        const mode = STATION_MODES.find(item => item.id === modeId) ?? STATION_MODES[0];
        this._modeItem.visible = scene.renderer === 'station';
        this._modeItem.setSensitive(enabled);
        this._modeItem.label.text = `Режим: ${mode.name}`;
        for (const {id, item} of this._modeChoices)
            item.setOrnament(id === modeId ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        this._libraryItem.visible = Main.sessionMode.allowSettings;
        this._updatingMenu = false;
    }

    async _loadScene() {
        const generation = ++this._loadGeneration;
        this._stopTimer();
        this._destroyActors();
        this._destroyRenderer();
        this._renderError = false;
        this._loading = false;
        if (!this._enabled || !this._settings.get_boolean('background-enabled')) {
            this._syncMenu();
            return;
        }

        this._loading = true;
        this._syncMenu();
        const scene = this._selectedScene();
        let candidate = null;
        try {
            if (!scene) throw new Error('The local scene library is empty');
            const image = Gio.File.new_for_path(`${scene.root}/${scene.image}`);
            if (!image.query_exists(null))
                throw new Error(`Missing scene image: ${scene.image}`);
            candidate = await createRenderer(scene.id, scene.root, scene);
            // An earlier import may finish after another selection or disable.
            if (!this._enabled || generation !== this._loadGeneration) {
                candidate.destroy();
                return;
            }
            this._renderer = candidate;
            candidate = null;
            this._scene = scene;
            this._imageUri = image.get_uri();
            if (scene.renderer === 'station')
                this._renderer.setMode(this._settings.get_string('station-mode'), true);
            this._renderer.update(0, NEUTRAL_POINTER, this._weather);
            this._loading = false;
            this._rebuild();
            this._syncMenu();
        } catch (error) {
            candidate?.destroy();
            if (!this._enabled || generation !== this._loadGeneration)
                return;
            this._loading = false;
            this._destroyActors();
            this._destroyRenderer();
            this._reportRenderError(error);
            Main.notifyError('Nightfall', `Не удалось открыть «${scene?.name ?? 'сцену'}». Можно выбрать другую сцену в меню.`);
        }
    }

    _rebuild() {
        this._stopTimer();
        this._destroyActors();
        if (!this._enabled || !this._renderer || !this._scene)
            return;

        const renderer = this._renderer;
        for (const monitor of Main.layoutManager.monitors) {
            const root = new St.Widget({
                x: monitor.x, y: monitor.y,
                width: monitor.width, height: monitor.height,
                reactive: false, can_focus: false,
                clip_to_allocation: true,
                style: `background-image: url("${this._imageUri}"); background-size: cover; background-position: center; background-color: #07121b;`,
            });
            const renderScale = Math.min(1, this._scene.width / monitor.width, this._scene.height / monitor.height);
            const renderWidth = Math.ceil(monitor.width * renderScale);
            const renderHeight = Math.ceil(monitor.height * renderScale);
            const overlay = new St.DrawingArea({
                width: renderWidth, height: renderHeight,
                scale_x: monitor.width / renderWidth,
                scale_y: monitor.height / renderHeight,
                reactive: false, can_focus: false,
            });
            overlay.connect('repaint', area => {
                if (renderer !== this._renderer || this._renderError)
                    return;
                const cr = area.get_context();
                try {
                    const [width, height] = area.get_surface_size();
                    renderer.paint(cr, width, height);
                } catch (error) {
                    this._reportRenderError(error);
                } finally {
                    cr.$dispose();
                }
            });
            root.add_child(overlay);
            Main.layoutManager._backgroundGroup.add_child(root);
            this._actors.push({root, overlay, monitor});
            overlay.queue_repaint();
        }
        this._syncPlayback();
    }

    _syncPlayback() {
        const locked = Main.sessionMode.isLocked || Main.sessionMode.isGreeter;
        if (this._indicator)
            this._indicator.visible = !locked;
        for (const {root} of this._actors)
            root.visible = !locked;
        if (!this._enabled || !this._renderer || locked || Main.overview.visible ||
            this._settings.get_boolean('paused') || this._renderError || !this._actors.length) {
            this._stopTimer();
            return;
        }
        if (this._timerId)
            return;
        this._lastTick = GLib.get_monotonic_time();
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, FRAME_MS, () => {
            if (!this._enabled || !this._renderer) {
                this._timerId = 0;
                return GLib.SOURCE_REMOVE;
            }
            const now = GLib.get_monotonic_time();
            const dt = Math.min(0.1, (now - this._lastTick) / 1000000);
            this._lastTick = now;
            try {
                this._renderer.update(dt, NEUTRAL_POINTER, this._weather);
                for (const {overlay} of this._actors)
                    overlay.queue_repaint();
            } catch (error) {
                this._timerId = 0;
                this._reportRenderError(error);
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _reportRenderError(error) {
        this._stopTimer();
        if (!this._renderError)
            console.error(`Nightfall animation paused: ${error.message}`);
        this._renderError = true;
        this._syncMenu();
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _destroyActors() {
        for (const {root} of this._actors ?? [])
            root.destroy();
        this._actors = [];
    }

    _destroyRenderer() {
        this._renderer?.destroy();
        this._renderer = null;
        this._scene = null;
        this._imageUri = null;
    }

    disable() {
        this._enabled = false;
        this._loadGeneration++;
        this._stopTimer();
        for (const [object, id] of this._connections ?? [])
            object.disconnect(id);
        this._connections = [];
        this._destroyActors();
        this._destroyRenderer();
        this._indicator?.destroy();
        this._indicator = null;
        this._sceneItems = null;
        this._sceneSection = null;
        this._scenes = null;
        this._weatherChoices = null;
        this._modeChoices = null;
        this._modeItem = null;
        this._settings = null;
    }
}
