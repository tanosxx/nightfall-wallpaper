import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SCENES, STATION_MODES, getScene} from './scene-registry.js';

function sceneCard(scene, extensionPath, choose) {
    const card = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        overflow: Gtk.Overflow.HIDDEN,
        css_classes: ['card'],
        width_request: 240,
        hexpand: true,
    });
    const picture = Gtk.Picture.new_for_filename(`${extensionPath}/${scene.image}`);
    picture.set({
        content_fit: Gtk.ContentFit.COVER,
        can_shrink: true,
        height_request: 150,
        hexpand: true,
        alternative_text: scene.name,
    });
    card.append(picture);

    const body = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        margin_start: 14,
        margin_end: 14,
        margin_top: 14,
        margin_bottom: 14,
    });
    body.append(new Gtk.Label({
        label: scene.name,
        xalign: 0,
        css_classes: ['title-3'],
    }));
    body.append(new Gtk.Label({
        label: scene.subtitle,
        xalign: 0,
        wrap: true,
        max_width_chars: 26,
        height_request: 44,
        valign: Gtk.Align.START,
        css_classes: ['dim-label'],
    }));
    const button = new Gtk.Button({
        label: 'Выбрать',
        margin_top: 8,
        css_classes: ['pill'],
        tooltip_text: `Показать «${scene.name}» на рабочем столе`,
    });
    button.connect('clicked', () => choose(scene));
    body.append(button);
    card.append(body);
    return {card, button, scene};
}

function switchRow(title, subtitle) {
    const row = new Adw.ActionRow({title, subtitle});
    const control = new Gtk.Switch({valign: Gtk.Align.CENTER});
    row.add_suffix(control);
    row.activatable_widget = control;
    return {row, control};
}

export default class NightfallPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set({
            title: 'Nightfall — Живые обои',
            default_width: 860,
            default_height: 860,
            search_enabled: false,
        });
        // Keep settings alive until this window closes. Widget bindings are
        // released with their widgets; the explicit listener is disconnected.
        window._nightfallSettings = settings;

        const page = new Adw.PreferencesPage({
            title: 'Коллекция',
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        const library = new Adw.PreferencesGroup({
            title: `${SCENES.length} сцен. Ваш рабочий стол.`,
            description: 'Города, далёкие станции и неизвестные планеты.',
        });
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            homogeneous: true,
            min_children_per_line: 2,
            max_children_per_line: 2,
            row_spacing: 18,
            column_spacing: 18,
            margin_top: 12,
            margin_bottom: 8,
            valign: Gtk.Align.START,
        });
        const cards = SCENES.map(scene => sceneCard(scene, this.path, selected => {
            settings.set_boolean('background-enabled', true);
            settings.set_string('selected-scene', selected.id);
            window.add_toast(new Adw.Toast({title: `«${selected.name}» выбрано`, timeout: 2}));
        }));
        for (const {card} of cards)
            flow.insert(card, -1);
        library.add(flow);
        page.add(library);

        const playback = new Adw.PreferencesGroup({title: 'Атмосфера'});
        const background = switchRow('Живые обои', 'Выключите, чтобы вернуться к обычным обоям Ubuntu.');
        const pause = switchRow('Пауза', 'Остановить движение и оставить текущий кадр.');
        settings.bind('background-enabled', background.control, 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('paused', pause.control, 'active', Gio.SettingsBindFlags.DEFAULT);
        playback.add(background.row);
        playback.add(pause.row);

        const weatherRow = new Adw.ActionRow({title: 'Осадки'});
        const weatherAdjustment = new Gtk.Adjustment({
            lower: 0, upper: 1, step_increment: 0.05, page_increment: 0.1,
        });
        const weather = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: weatherAdjustment,
            width_request: 230,
            draw_value: false,
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Интенсивность осадков: от 0 до 100 процентов',
        });
        weather.add_mark(0, Gtk.PositionType.BOTTOM, null);
        weather.add_mark(0.5, Gtk.PositionType.BOTTOM, null);
        weather.add_mark(1, Gtk.PositionType.BOTTOM, null);
        settings.bind('weather', weatherAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        weatherRow.add_suffix(weather);
        playback.add(weatherRow);
        let syncingMode = false;
        const modeRow = new Adw.ComboRow({
            title: 'Режим станции',
            subtitle: 'Освещение корпуса и ангара',
            model: Gtk.StringList.new(STATION_MODES.map(mode => mode.name)),
        });
        modeRow.connect('notify::selected', () => {
            if (!syncingMode && STATION_MODES[modeRow.selected])
                settings.set_string('station-mode', STATION_MODES[modeRow.selected].id);
        });
        playback.add(modeRow);
        page.add(playback);

        const hint = new Adw.PreferencesGroup({
            description: 'Быстро переключать сцены и ставить анимацию на паузу можно из значка Nightfall в верхней панели.',
        });
        page.add(hint);
        window.add(page);

        const sync = () => {
            const enabled = settings.get_boolean('background-enabled');
            const selected = settings.get_string('selected-scene');
            const scene = getScene(selected);
            for (const item of cards) {
                const active = enabled && item.scene.id === selected;
                item.button.label = active ? '✓ Выбрано' : 'Выбрать';
                if (active)
                    item.button.add_css_class('suggested-action');
                else
                    item.button.remove_css_class('suggested-action');
            }
            pause.row.sensitive = enabled;
            weatherRow.sensitive = enabled;
            weatherRow.title = scene.weatherLabel || 'Осадки';
            const amount = Math.round(settings.get_double('weather') * 100);
            const activity = scene.control === 'activity';
            const flow = scene.control === 'flow';
            weatherRow.subtitle = activity
                ? (scene.id !== 'station' ? `Активность: ${amount}%` : amount === 0 ? 'Перерыв'
                    : amount === 35 ? 'Спокойная: 35%'
                    : amount === 100 ? 'Активная: 100%' : `Активность: ${amount}%`)
                : flow ? `Интенсивность: ${amount}%`
                    : (amount === 0 ? 'Без осадков' : `Интенсивность: ${amount}%`);
            weather.tooltip_text = activity && scene.id === 'station'
                ? 'Работа станции: от перерыва до активной смены'
                : `${scene.weatherLabel}: от 0 до 100 процентов`;
            modeRow.visible = scene.id === 'station';
            modeRow.sensitive = enabled;
            syncingMode = true;
            modeRow.selected = Math.max(0, STATION_MODES.findIndex(mode => mode.id === settings.get_string('station-mode')));
            syncingMode = false;
        };
        const changedId = settings.connect('changed', sync);
        sync();
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            window._nightfallSettings = null;
            return false;
        });
    }
}
