import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {STATION_MODES, getScene} from './scene-registry.js';
import {listAvailableScenes, getAvailableScene} from './installed-scenes.js';
import {SceneManagerClient} from './scene-manager-client.js';

function textLabel(label, properties = {}) {
    return new Gtk.Label({label: String(label ?? ''), use_markup: false, xalign: 0,
        wrap: true, ...properties});
}

function fileSize(bytes) {
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} МБ`
        : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function sceneCard(scene, imagePath = null) {
    const card = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
        overflow: Gtk.Overflow.HIDDEN, css_classes: ['card'], width_request: 240, hexpand: true});
    const picture = new Gtk.Picture({content_fit: Gtk.ContentFit.COVER, can_shrink: true,
        height_request: 150, hexpand: true, alternative_text: scene.name});
    const placeholder = new Gtk.Image({icon_name: 'preferences-desktop-wallpaper-symbolic',
        pixel_size: 48, height_request: 150, css_classes: ['dim-label']});
    const media = new Gtk.Stack({height_request: 150});
    media.add_named(placeholder, 'placeholder');
    media.add_named(picture, 'picture');
    const setImage = path => {
        if (path && Gio.File.new_for_path(path).query_exists(null)) {
            picture.set_filename(path);
            media.visible_child_name = 'picture';
        }
    };
    setImage(imagePath);
    card.append(media);
    const body = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8,
        margin_start: 14, margin_end: 14, margin_top: 14, margin_bottom: 14});
    body.append(textLabel(scene.name, {css_classes: ['title-3']}));
    body.append(textLabel(scene.subtitle || scene.description, {max_width_chars: 26,
        height_request: 44, valign: Gtk.Align.START, css_classes: ['dim-label']}));
    card.append(body);
    return {card, body, setImage};
}

function newFlow() {
    return new Gtk.FlowBox({selection_mode: Gtk.SelectionMode.NONE, homogeneous: true,
        min_children_per_line: 2, max_children_per_line: 2, row_spacing: 18,
        column_spacing: 18, margin_top: 12, margin_bottom: 8, valign: Gtk.Align.START});
}

function clearFlow(flow) {
    while (flow.get_first_child())
        flow.remove(flow.get_first_child());
}

function switchRow(title, subtitle) {
    const row = new Adw.ActionRow({title, subtitle, use_markup: false});
    const control = new Gtk.Switch({valign: Gtk.Align.CENTER});
    row.add_suffix(control);
    row.activatable_widget = control;
    return {row, control};
}

// Kept independent of ExtensionPreferences so the real widgets and callbacks
// can be exercised with an isolated schema and a fake download client.
export function buildPreferences(window, settings, extensionPath, dependencies = {}) {
    const client = dependencies.client ?? new SceneManagerClient(extensionPath);
    const availableScenes = dependencies.listAvailableScenes ?? listAvailableScenes;
    const availableScene = dependencies.getAvailableScene ?? getAvailableScene;
    let alive = true;
    let foreground = null;
    let catalog = null;
    let catalogRequested = false;
    let previewGeneration = 0;
    let previewOperation = null;
    let fileChooser = null;
    let installedCards = [];
    let catalogCards = [];
    const actionButtons = new Set();
    const statusStrips = [];
    let lastStatus = '';

    window.set({title: 'Nightfall — Живые обои', default_width: 860,
        default_height: 860, search_enabled: false});
    window._nightfallSettings = settings;

    function statusStrip() {
        const box = new Gtk.Box({spacing: 10, margin_top: 8, margin_bottom: 8});
        const spinner = new Gtk.Spinner({valign: Gtk.Align.CENTER});
        const label = textLabel('', {hexpand: true, css_classes: ['dim-label']});
        const cancel = new Gtk.Button({label: 'Отменить', valign: Gtk.Align.CENTER});
        cancel.connect('clicked', () => foreground?.cancel());
        box.append(spinner);
        box.append(label);
        box.append(cancel);
        const strip = {box, spinner, label, cancel};
        statusStrips.push(strip);
        return box;
    }

    function setStatus(message = lastStatus) {
        lastStatus = message;
        for (const strip of statusStrips) {
            strip.box.visible = Boolean(message || foreground);
            strip.label.label = message;
            strip.spinner.spinning = Boolean(foreground);
            strip.spinner.visible = Boolean(foreground);
            strip.cancel.visible = Boolean(foreground);
        }
        for (const button of actionButtons)
            button.sensitive = !foreground;
    }

    function actionButton(label, callback, properties = {}) {
        const button = new Gtk.Button({label, css_classes: ['pill'], ...properties});
        button.connect('clicked', callback);
        actionButtons.add(button);
        return button;
    }

    function choose(scene) {
        settings.set_boolean('background-enabled', true);
        settings.set_string('selected-scene', scene.id);
        window.add_toast(new Adw.Toast({title: `«${scene.name}» выбрано`, timeout: 2}));
    }

    function librarySignature() {
        return JSON.stringify(availableScenes(extensionPath)
            .map(scene => [scene.id, scene.version, scene.root])
            .sort((a, b) => a[0].localeCompare(b[0])));
    }

    async function operate(command, args, message, onSuccess) {
        if (!alive || foreground)
            return;
        const mutatesLibrary = ['install', 'install-file', 'remove'].includes(command);
        const previousLibrary = mutatesLibrary ? librarySignature() : null;
        let successHandled = false;
        // The manager serializes writes to its cache and registry. Stop and
        // reap an in-flight cover download before starting a user operation.
        ++previewGeneration;
        const pendingPreview = previewOperation;
        let cancelledBeforeStart = false;
        foreground = {cancel() { cancelledBeforeStart = true; pendingPreview?.cancel(); }};
        setStatus(message);
        try {
            if (pendingPreview) {
                pendingPreview.cancel();
                try { await pendingPreview.promise; } catch { /* The requested operation takes priority. */ }
            }
            if (!alive || cancelledBeforeStart) {
                if (alive)
                    setStatus('Операция отменена.');
                return;
            }
            foreground = client.run(command, ...args);
            const result = await foreground.promise;
            if (alive) {
                await onSuccess(result);
                successHandled = true;
            }
        } catch (error) {
            if (alive) {
                setStatus(error.message || String(error));
                if (!error.cancelled)
                    window.add_toast(new Adw.Toast({title: 'Не удалось выполнить операцию. Подробности — над сценами.', timeout: 5}));
            }
        } finally {
            // The atomic commit can finish just before a cancellation kills
            // the child, so a missing success response is not proof of rollback.
            // Notify Shell even if the preferences window was closed meanwhile.
            if (mutatesLibrary && !successHandled && previousLibrary !== librarySignature()) {
                libraryChanged();
                if (alive)
                    setStatus('Изменение уже сохранено. Список установленных сцен обновлён.');
            }
            foreground = null;
            if (alive) {
                setStatus();
                loadPreviews(catalogCards, ++previewGeneration);
            }
        }
    }

    const installedPage = new Adw.PreferencesPage({name: 'installed', title: 'Установлено',
        icon_name: 'preferences-desktop-wallpaper-symbolic'});
    const installedGroup = new Adw.PreferencesGroup({title: 'Ваши сцены',
        description: 'Скачанные сцены хранятся на этом компьютере и работают без интернета.'});
    installedGroup.add(statusStrip());
    const installedFlow = newFlow();
    installedGroup.add(installedFlow);
    installedPage.add(installedGroup);

    function libraryChanged() {
        settings.set_uint('library-revision', (settings.get_uint('library-revision') + 1) >>> 0);
    }

    function install(scene) {
        operate('install', [scene.id], `Скачиваем «${scene.name}» · ${fileSize(scene.package.bytes)}…`, () => {
            libraryChanged();
            setStatus(`«${scene.name}» установлено. Теперь можно выбрать сцену.`);
        });
    }

    function remove(scene) {
        // Shell switches away before the files disappear from the local store.
        if (settings.get_string('selected-scene') === scene.id)
            settings.set_string('selected-scene', 'nightfall');
        operate('remove', [scene.id], `Удаляем «${scene.name}» с компьютера…`, () => {
            libraryChanged();
            setStatus(`«${scene.name}» удалено. Сцену можно снова скачать в каталоге.`);
        });
    }

    function installFromFile() {
        if (foreground || fileChooser)
            return;
        fileChooser = new Gtk.FileChooserNative({title: 'Установить пакет сцены',
            transient_for: window, modal: true, action: Gtk.FileChooserAction.OPEN,
            accept_label: 'Установить', cancel_label: 'Отмена'});
        const filter = new Gtk.FileFilter({name: 'Пакет сцены Nightfall (*.zip)'});
        filter.add_pattern('*.zip');
        fileChooser.add_filter(filter);
        fileChooser.connect('response', (chooser, response) => {
            const file = response === Gtk.ResponseType.ACCEPT ? chooser.get_file() : null;
            chooser.destroy();
            fileChooser = null;
            if (!alive || !file)
                return;
            if (!file.get_path()) {
                setStatus('Сначала сохраните ZIP-пакет на этот компьютер.');
                return;
            }
            operate('install-file', [file.get_path()], `Проверяем и устанавливаем ${file.get_basename()}…`, result => {
                libraryChanged();
                setStatus(`«${result.scene?.name || 'Сцена'}» установлено. Теперь можно выбрать сцену.`);
            });
        });
        fileChooser.show();
    }

    function renderInstalled() {
        for (const card of installedCards)
            for (const button of card.buttons)
                actionButtons.delete(button);
        installedCards = [];
        clearFlow(installedFlow);
        const scenes = availableScenes(extensionPath);
        installedGroup.title = `Установлено: ${scenes.length}`;
        for (const scene of scenes) {
            const card = sceneCard(scene, `${scene.root || extensionPath}/${scene.image}`);
            card.body.append(textLabel(scene.bundled ? 'Встроенная сцена'
                : `Версия ${scene.version ?? 1} · ${scene.author || 'Nightfall'}`, {css_classes: ['dim-label']}));
            const buttons = new Gtk.Box({spacing: 8, margin_top: 8});
            const chooseButton = actionButton('Выбрать', () => choose(scene), {hexpand: true});
            buttons.append(chooseButton);
            const item = {scene, chooseButton, buttons: [chooseButton]};
            if (!scene.bundled && scene.id !== 'nightfall') {
                const removeButton = actionButton('Удалить', () => remove(scene),
                    {tooltip_text: 'Удалить скачанные файлы этой сцены с компьютера'});
                buttons.append(removeButton);
                item.buttons.push(removeButton);
            }
            card.body.append(buttons);
            installedFlow.insert(card.card, -1);
            installedCards.push(item);
        }
        setStatus();
    }

    const playback = new Adw.PreferencesGroup({title: 'Атмосфера'});
    const background = switchRow('Живые обои', 'Выключите, чтобы вернуться к обычным обоям Ubuntu.');
    const pause = switchRow('Пауза', 'Остановить движение и оставить текущий кадр.');
    settings.bind('background-enabled', background.control, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('paused', pause.control, 'active', Gio.SettingsBindFlags.DEFAULT);
    playback.add(background.row);
    playback.add(pause.row);
    const weatherRow = new Adw.ActionRow({title: 'Осадки', use_markup: false});
    const weatherAdjustment = new Gtk.Adjustment({lower: 0, upper: 1,
        step_increment: 0.05, page_increment: 0.1});
    const weather = new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL,
        adjustment: weatherAdjustment, width_request: 230, draw_value: false,
        valign: Gtk.Align.CENTER, tooltip_text: 'Интенсивность осадков: от 0 до 100 процентов'});
    for (const value of [0, 0.5, 1])
        weather.add_mark(value, Gtk.PositionType.BOTTOM, null);
    settings.bind('weather', weatherAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    weatherRow.add_suffix(weather);
    playback.add(weatherRow);
    let syncingMode = false;
    const modeRow = new Adw.ComboRow({title: 'Режим станции', subtitle: 'Освещение корпуса и ангара',
        use_markup: false, model: Gtk.StringList.new(STATION_MODES.map(mode => mode.name))});
    modeRow.connect('notify::selected', () => {
        if (!syncingMode && STATION_MODES[modeRow.selected])
            settings.set_string('station-mode', STATION_MODES[modeRow.selected].id);
    });
    playback.add(modeRow);
    installedPage.add(playback);
    installedPage.add(new Adw.PreferencesGroup({description:
        'Быстро переключать сцены и ставить анимацию на паузу можно из значка Nightfall в верхней панели.'}));
    window.add(installedPage);

    const catalogPage = new Adw.PreferencesPage({name: 'catalog', title: 'Каталог', icon_name: 'folder-download-symbolic'});
    const catalogGroup = new Adw.PreferencesGroup({title: 'Каталог Nightfall', description:
        'Сцены загружаются с GitHub. Для просмотра установленных сцен интернет не нужен.'});
    const refreshButton = actionButton('Обновить', () => refreshCatalog(), {valign: Gtk.Align.CENTER});
    catalogGroup.header_suffix = refreshButton;
    catalogGroup.add(statusStrip());
    catalogGroup.add(actionButton('Установить из файла…', installFromFile,
        {halign: Gtk.Align.START, margin_top: 8, tooltip_text: 'Установить ZIP-пакет сцены, скачанный с сайта'}));
    const catalogStatus = textLabel('Откройте каталог, чтобы загрузить список доступных сцен.',
        {margin_top: 8, css_classes: ['dim-label']});
    catalogGroup.add(catalogStatus);
    const catalogFlow = newFlow();
    catalogGroup.add(catalogFlow);
    catalogPage.add(catalogGroup);
    catalogPage.add(new Adw.PreferencesGroup({description:
        'Хотите добавить свою работу? Предложите сцену через GitHub. После проверки она появится в общем каталоге.'}));
    const contributeGroup = new Adw.PreferencesGroup();
    contributeGroup.add(new Gtk.LinkButton({label: 'Как предложить свою сцену',
        uri: 'https://github.com/tanosxx/nightfall-wallpaper/blob/main/CONTRIBUTING.md', halign: Gtk.Align.START}));
    catalogPage.add(contributeGroup);
    window.add(catalogPage);

    async function loadPreviews(cards, generation) {
        const pending = previewOperation;
        if (pending) {
            pending.cancel();
            try { await pending.promise; } catch { /* Replace previews for an older card set. */ }
        }
        for (const item of cards) {
            if (!alive || foreground || generation !== previewGeneration)
                return;
            if (item.hasLocalImage)
                continue;
            let operation;
            try {
                operation = client.run('preview', item.scene.id);
                previewOperation = operation;
                const result = await operation.promise;
                if (alive && generation === previewGeneration)
                    item.setImage(result.path);
            } catch {
                // A failed preview must not hide an otherwise usable catalogue.
            } finally {
                if (previewOperation === operation)
                    previewOperation = null;
            }
        }
    }

    function renderCatalog() {
        ++previewGeneration;
        for (const card of catalogCards)
            for (const button of card.buttons)
                actionButtons.delete(button);
        catalogCards = [];
        clearFlow(catalogFlow);
        if (!catalog)
            return;
        const installed = new Map(availableScenes(extensionPath).map(scene => [scene.id, scene]));
        for (const scene of catalog.scenes) {
            const local = installed.get(scene.id);
            const card = sceneCard(scene, local ? `${local.root || extensionPath}/${local.image}` : null);
            card.body.append(textLabel(`${scene.author} · ${scene.license}`, {css_classes: ['dim-label']}));
            card.body.append(textLabel(`${fileSize(scene.package.bytes)} · версия ${scene.version}`,
                {css_classes: ['dim-label']}));
            const actions = new Gtk.Box({spacing: 8, margin_top: 8});
            const buttons = [];
            const update = local && !local.bundled && scene.version > local.version;
            if (!local || update) {
                const download = actionButton(update ? 'Обновить сцену' : 'Скачать', () => install(scene),
                    {hexpand: true, css_classes: ['pill', 'suggested-action']});
                buttons.push(download);
                actions.append(download);
            }
            if (local) {
                const select = actionButton('Выбрать', () => choose(local), {hexpand: true});
                buttons.push(select);
                actions.append(select);
            }
            card.body.append(actions);
            catalogFlow.insert(card.card, -1);
            catalogCards.push({...card, scene, buttons, hasLocalImage: Boolean(local)});
        }
        setStatus();
        if (!foreground)
            loadPreviews(catalogCards, previewGeneration);
    }

    async function refreshCatalog() {
        catalogRequested = true;
        await operate('refresh', [], 'Загружаем каталог с GitHub…', result => {
            catalog = result.catalog;
            catalogStatus.label = result.cached
                ? 'Показана сохранённая копия каталога. Не удалось связаться с GitHub; попробуйте обновить позже.'
                : 'Каталог обновлён. Выберите сцены, которые хотите сохранить на компьютере.';
            renderCatalog();
            setStatus(result.cached ? 'Нет соединения с каталогом. Установленные сцены продолжают работать.' : '');
        });
    }

    function sync() {
        const enabled = settings.get_boolean('background-enabled');
        const selected = settings.get_string('selected-scene');
        const scene = availableScene(selected, extensionPath) || getScene(selected);
        for (const item of installedCards) {
            const active = enabled && item.scene.id === selected;
            item.chooseButton.label = active ? '✓ Выбрано' : 'Выбрать';
            if (active)
                item.chooseButton.add_css_class('suggested-action');
            else
                item.chooseButton.remove_css_class('suggested-action');
        }
        pause.row.sensitive = enabled;
        weatherRow.sensitive = enabled;
        weatherRow.title = scene.weatherLabel || 'Осадки';
        const amount = Math.round(settings.get_double('weather') * 100);
        weatherRow.subtitle = scene.control === 'activity'
            ? (scene.id !== 'station' ? `Активность: ${amount}%` : amount === 0 ? 'Перерыв'
                : amount === 35 ? 'Спокойная: 35%' : amount === 100 ? 'Активная: 100%' : `Активность: ${amount}%`)
            : scene.control === 'flow' ? `Интенсивность: ${amount}%`
                : (amount === 0 ? 'Без осадков' : `Интенсивность: ${amount}%`);
        weather.tooltip_text = scene.control === 'activity' && scene.id === 'station'
            ? 'Работа станции: от перерыва до активной смены'
            : `${scene.weatherLabel || 'Интенсивность'}: от 0 до 100 процентов`;
        modeRow.visible = scene.id === 'station' || scene.renderer === 'station';
        modeRow.sensitive = enabled;
        syncingMode = true;
        modeRow.selected = Math.max(0, STATION_MODES.findIndex(mode => mode.id === settings.get_string('station-mode')));
        syncingMode = false;
    }
    const settingsId = settings.connect('changed', (_settings, key) => {
        if (key === 'library-revision') {
            renderInstalled();
            renderCatalog();
        }
        sync();
    });
    const pageId = window.connect('notify::visible-page', () => {
        if (window.visible_page === catalogPage && !catalogRequested)
            refreshCatalog();
    });
    renderInstalled();
    setStatus('');
    sync();
    window.connect('close-request', () => {
        alive = false;
        ++previewGeneration;
        fileChooser?.destroy();
        fileChooser = null;
        client.cancelAll();
        settings.disconnect(settingsId);
        window.disconnect(pageId);
        window._nightfallSettings = null;
        return false;
    });
}

export default class NightfallPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        buildPreferences(window, this.getSettings(), this.path);
    }
}
