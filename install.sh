#!/usr/bin/env bash
set -euo pipefail

wallpaper_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
extension_uuid='nightfall@local'
source_dir="$wallpaper_dir/extension/$extension_uuid"
requested_bundle=''
usage() {
    printf '%s\n' 'Usage: bash install.sh [--bundle PATH]' \
        '  No arguments: build from sources, or use the ZIP beside this installer.' \
        '  --bundle PATH: verify and install a prepared Nightfall ZIP without build tools.' \
        '  Run as your normal GNOME desktop user, without sudo.'
}
case "${1:-}" in
    -h|--help) usage; exit 0 ;;
    --bundle)
        if [[ $# -ne 2 || -z "${2:-}" ]]; then usage >&2; exit 2; fi
        requested_bundle="$2"
        ;;
    '')
        if [[ $# -ne 0 ]]; then usage >&2; exit 2; fi
        if [[ ! -d "$source_dir" && -f "$wallpaper_dir/$extension_uuid.shell-extension.zip" ]]; then
            requested_bundle="$wallpaper_dir/$extension_uuid.shell-extension.zip"
        fi
        ;;
    *) usage >&2; exit 2 ;;
esac

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    printf '%s\n' 'Запустите установку от обычного пользователя, без sudo.' >&2
    exit 1
fi
for tool in gnome-shell gnome-extensions python3 install cp mktemp; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf 'Не найдена команда: %s\n' "$tool" >&2
        exit 1
    fi
done
if ! python3 -c 'import gi; gi.require_version("Gtk", "4.0"); gi.require_version("Adw", "1"); from gi.repository import Gio, Gtk, Adw' >/dev/null 2>&1; then
    printf '%s\n' 'Для установки нужны системный Python 3 с python3-gi, GTK 4 и libadwaita. Автоматическая установка пакетов не выполняется.' >&2
    exit 1
fi
shell_version="$(gnome-shell --version)"
if [[ ! "$shell_version" =~ GNOME\ Shell\ 50([.[:space:]]|$) ]]; then
    printf 'Эта версия обоев подготовлена для GNOME 50. Обнаружено: %s\n' "$shell_version" >&2
    exit 1
fi
if [[ ! -f "$wallpaper_dir/scripts/verify-bundle.py" ]]; then
    printf '%s\n' 'Missing scripts/verify-bundle.py. Extract the complete release folder.' >&2
    exit 1
fi
bundle_dir="$(mktemp -d -t nightfall-install.XXXXXX)"
trap 'rm -rf -- "$bundle_dir"' EXIT
bundle_path="$bundle_dir/$extension_uuid.shell-extension.zip"
if [[ -n "$requested_bundle" ]]; then
    if [[ ! -f "$requested_bundle" ]]; then
        printf 'Bundle does not exist: %s\n' "$requested_bundle" >&2
        exit 1
    fi
    # Verify and install the same private copy, even if the input path changes.
    cp -- "$requested_bundle" "$bundle_path"
else
    for tool in gjs glib-compile-schemas; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            printf 'Missing source-build command: %s. Use --bundle for a prepared release.\n' "$tool" >&2
            exit 1
        fi
    done
    for source_file in extension.js native-renderer.js polar-renderer.js polar-motion.js polar-data.js station-renderer.js station-motion.js station-data.js station-lighting.js station-relief-data.js scene-catalog.js scene-registry.js abyss-renderer.js junction-renderer.js cloudcity-renderer.js titans-renderer.js titans-ground.js titans-sky.js titans-canvas.js titans-timeline.js titans-smoke-flow.js titans-left-smoke.js titans-suit.js scene-data.js simulation.js prefs.js metadata.json schemas/org.gnome.shell.extensions.nightfall.gschema.xml; do
        if [[ ! -f "$source_dir/$source_file" ]]; then
            printf 'Не хватает файла: %s. Распакуйте всю папку nightfall-wallpaper.\n' "$source_file" >&2
            exit 1
        fi
    done
    for relief_file in lighting.json normal.png material.png depth.png dark.png light-{00..11}.png weld-{0..1}.png sector-ring.png sector-spine.png sector-hangar.png; do
        if [[ ! -f "$wallpaper_dir/assets/station-relief/$relief_file" ]]; then
            printf 'Не хватает файла: assets/station-relief/%s. Распакуйте всю папку nightfall-wallpaper.\n' "$relief_file" >&2
            exit 1
        fi
    done
    for asset_file in assets/city.png assets/polar.png assets/station.png assets/abyss.png assets/junction.png assets/cloudcity.png assets/titans.png package-extension.py catalog-export.js app/nightfall-wallpaper.desktop app/nightfall-wallpaper.svg; do
        if [[ ! -f "$wallpaper_dir/$asset_file" ]]; then
            printf 'Не хватает файла: %s. Распакуйте всю папку nightfall-wallpaper.\n' "$asset_file" >&2
            exit 1
        fi
    done
    staged_extension="$bundle_dir/$extension_uuid"
    python3 "$wallpaper_dir/package-extension.py" --stage "$staged_extension" --archive "$bundle_path"
fi
install_files="$bundle_dir/install-files"
python3 "$wallpaper_dir/scripts/verify-bundle.py" "$bundle_path" --extract-install-files "$install_files"

# Migrate the previous complete collection before replacing its extension.
# The helper validates data and commits its registry atomically; a failure
# stops the upgrade while the previous extension is still installed.
nightfall_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
previous_extension="$nightfall_data_dir/gnome-shell/extensions/$extension_uuid"
if [[ -f "$install_files/scene-manager.py" && -d "$previous_extension/assets" ]]; then
    printf '%s\n' 'Сохраняем установленные сцены в локальную библиотеку…'
    python3 "$install_files/scene-manager.py" import-bundled "$previous_extension"
fi

# Only this extension is touched. Background picture settings are never changed.
# GNOME caches JavaScript modules, so updates can require a new login as well.
if gnome-extensions info "$extension_uuid" >/dev/null 2>&1; then
    gnome-extensions disable "$extension_uuid" || true
fi
gnome-extensions install --force "$bundle_path"
install -D -m 644 "$install_files/app/nightfall-wallpaper.desktop" "$nightfall_data_dir/applications/nightfall-wallpaper.desktop"
install -D -m 644 "$install_files/app/nightfall-wallpaper.svg" "$nightfall_data_dir/icons/hicolor/scalable/apps/nightfall-wallpaper.svg"
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$nightfall_data_dir/applications" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f "$nightfall_data_dir/icons/hicolor" >/dev/null 2>&1 || true
fi
printf '%s\n' 'Nightfall установлен. Исходные настройки обоев сохранены без изменений.'

gnome-extensions enable "$extension_uuid" 2>/dev/null || true
# A new extension may not yet be known to the running Shell. Queue only our
# UUID for the next login, preserving the order and state of all other entries.
activation_status="$(python3 - "$extension_uuid" "$install_files/metadata.json" <<'PY'
import json
import sys
from gi.repository import Gio, GLib

uuid = sys.argv[1]
with open(sys.argv[2], encoding='utf-8') as metadata_file:
    expected_version = int(json.load(metadata_file)['version'])
settings = Gio.Settings.new('org.gnome.shell')
enabled = list(settings.get_strv('enabled-extensions'))
disabled = list(settings.get_strv('disabled-extensions'))
if uuid not in enabled:
    if not settings.is_writable('enabled-extensions'):
        sys.exit('Список расширений недоступен для изменения.')
    if not settings.set_strv('enabled-extensions', enabled + [uuid]):
        sys.exit('Не удалось запланировать включение Nightfall.')
if uuid in disabled:
    if not settings.is_writable('disabled-extensions'):
        sys.exit('Список отключённых расширений недоступен для изменения.')
    if not settings.set_strv('disabled-extensions', [item for item in disabled if item != uuid]):
        sys.exit('Не удалось снять отключение Nightfall.')
Gio.Settings.sync()

if settings.get_boolean('disable-user-extensions'):
    print('all-disabled')
else:
    try:
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        reply = bus.call_sync('org.gnome.Shell', '/org/gnome/Shell',
            'org.gnome.Shell.Extensions', 'GetExtensionInfo',
            GLib.Variant('(s)', (uuid,)), GLib.VariantType.new('(a{sv})'),
            Gio.DBusCallFlags.NONE, 3000, None)
        info = reply.unpack()[0]
        state = int(info.get('state', 0))
        if state == 3:
            print('error')
        elif int(info.get('version', 0)) > 0 and int(info['version']) < expected_version:
            print('queued-update')
        elif state == 1:
            print('active')
        elif state == 2:
            locked = bus.call_sync('org.gnome.ScreenSaver', '/org/gnome/ScreenSaver',
                'org.gnome.ScreenSaver', 'GetActive', None,
                GLib.VariantType.new('(b)'), Gio.DBusCallFlags.NONE, 3000, None).unpack()[0]
            print('locked' if locked else 'queued')
        else:
            print('queued')
    except GLib.Error:
        print('queued')
PY
)"
case "$activation_status" in
    active)
        printf '%s\n' 'Nightfall включён и работает.'
        ;;
    locked)
        printf '%s\n' 'Nightfall включён. Анимация возобновится после разблокировки экрана.'
        ;;
    all-disabled)
        printf '%s\n' 'Nightfall добавлен в список включённых, но в GNOME глобально выключены пользовательские расширения.'
        printf '%s\n' 'Включите их в приложении «Расширения». Эта установка не меняет глобальный переключатель.'
        ;;
    queued-update)
        printf '%s\n' 'Обновление Nightfall установлено; сейчас GNOME ещё использует прежнюю версию из памяти.'
        printf '%s\n' 'Новая версия запустится после следующего выхода из сеанса и входа. Сохраните работу перед выходом.'
        printf '%s\n' 'Библиотека сцен и значок в верхней панели также станут доступны после нового входа.'
        ;;
    error)
        printf '%s\n' 'GNOME сообщил об ошибке расширения. Подробности: gnome-extensions info nightfall@local'
        printf '%s\n' 'Если это обновление установленной версии, сохраните работу и войдите в сеанс заново.'
        ;;
    *)
        printf '%s\n' 'Nightfall будет включён при следующем входе в GNOME.'
        printf '%s\n' 'Когда будет удобно, сохраните работу, выйдите из сеанса и войдите снова.'
        ;;
esac
printf '\n%s\n' 'Библиотека сцен: найдите «Nightfall — Живые обои» в меню приложений.'
printf '%s\n' 'Открыть из терминала: gnome-extensions prefs nightfall@local'
printf '\n%s\n' 'Выключить анимацию и вернуть прежние обои: gnome-extensions disable nightfall@local'
printf '%s\n' 'Удалить: запустите uninstall.sh из этой папки.'
