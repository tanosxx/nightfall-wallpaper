#!/usr/bin/env bash
set -euo pipefail

extension_uuid='nightfall@local'
if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf '%s\n' 'Не найдена команда gnome-extensions.' >&2
    exit 1
fi
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    printf '%s\n' 'Запустите удаление от обычного пользователя, без sudo.' >&2
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'from gi.repository import Gio' >/dev/null 2>&1; then
    printf '%s\n' 'Для удаления нужен системный Python 3 с модулем python3-gi.' >&2
    exit 1
fi

gnome-extensions disable "$extension_uuid" 2>/dev/null || true
if gnome-extensions uninstall "$extension_uuid"; then
    # Remove a queued activation as well, including before the first new login.
    python3 - "$extension_uuid" <<'PY'
import sys
from gi.repository import Gio

uuid = sys.argv[1]
settings = Gio.Settings.new('org.gnome.shell')
for key in ('enabled-extensions', 'disabled-extensions'):
    entries = list(settings.get_strv(key))
    if uuid in entries:
        settings.set_strv(key, [item for item in entries if item != uuid])
Gio.Settings.sync()
PY
    nightfall_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
    rm -f -- "$nightfall_data_dir/applications/nightfall-wallpaper.desktop" "$nightfall_data_dir/icons/hicolor/scalable/apps/nightfall-wallpaper.svg"
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$nightfall_data_dir/applications" >/dev/null 2>&1 || true
    fi
    if command -v gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t -f "$nightfall_data_dir/icons/hicolor" >/dev/null 2>&1 || true
    fi
    printf '%s\n' 'Nightfall удалён. Снова отображаются ваши прежние обои.'
    printf '%s\n' 'Скачанные сцены сохранены в локальной библиотеке для повторной установки Nightfall.'
else
    printf '%s\n' 'Не удалось удалить расширение. Проверьте, что оно установлено и команда запущена из вашего сеанса GNOME.' >&2
    exit 1
fi
