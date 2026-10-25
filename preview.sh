#!/usr/bin/env bash
set -euo pipefail
wallpaper_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
printf '%s\n' 'Откройте http://127.0.0.1:8847/ в браузере. Остановить предпросмотр: Ctrl+C.'
exec python3 -m http.server 8847 --bind 127.0.0.1 --directory "$wallpaper_dir"
