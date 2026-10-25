#!/usr/bin/env python3
"""Install validated, data-only Nightfall scenes outside the GNOME Shell process.

Scene packages contain images and bounded JSON, never JavaScript or executables.
The on-disk registry holds identifiers only; paths are always derived here.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib

CATALOG_URL = 'https://tanosxx.github.io/nightfall-wallpaper/catalog/index.json'
PAGES_PREFIX = '/nightfall-wallpaper/'
RELEASE_PREFIX = '/tanosxx/nightfall-wallpaper/releases/download/'
ENGINE_VERSION = 1
MAX_ARCHIVE = 160 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_JSON = 512 * 1024
MAX_CATALOG = 2 * 1024 * 1024
MAX_PREVIEW = 4 * 1024 * 1024
MAX_FILES = 512
MAX_PIXELS = 16 * 1024 * 1024
MAX_DECODED = 256 * 1024 * 1024
ID_RE = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
HASH_RE = re.compile(r'^[a-f0-9]{64}$')
PART_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
NOTICES = {'LICENSE', 'NOTICE.md', 'ASSETS.md'}
RENDERERS = {'nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans'}
REQUIRED_ASSETS = {
    'nightfall': set(), 'polar': set(),
    'station': {
        *('assets/station-native/puff-%d.png' % i for i in range(8)),
        *('assets/station-native/pool-%d.png' % i for i in range(5)),
        *('assets/station-native/weld-%d.png' % i for i in range(2)),
        *('assets/station-native/' + n for n in ('space-mask.png', 'nebula-mask.png', 'nebula.png')),
        'assets/station-relief/lighting.json', 'assets/station-relief/dark.png',
        *('assets/station-relief/light-%02d.png' % i for i in range(12)),
        *('assets/station-relief/sector-' + n + '.png' for n in ('ring', 'spine', 'hangar')),
    },
    'abyss': {
        *('assets/abyss-native/light-%02d.png' % i for i in range(82)),
        *('assets/abyss-native/' + n for n in ('ambient.png', 'water-mask.png', 'elevator-ambient.png',
                                            'interior-mask.png', 'transit-0-mask.png', 'transit-1-mask.png')),
    },
    'junction': {'assets/junction-native/atlas.png'},
    'cloudcity': {
        *('assets/cloudcity-native/' + n + '.png' for n in ('cloud-strip', 'cloud-mask', 'windows-dark',
           'windows-bright', 'beacons-dark', 'rotor-0', 'rotor-1', 'hub-0', 'hub-1')),
    },
    'titans': {
        *('assets/titans/' + n + '.png' for n in ('ground-flames', 'ground-smoke', 'ground-emission',
           'ground-flow-horizon', 'ground-flow-near', 'ground-flow-right', 'ground-flow-wreck',
           'sky-emissions', 'sky-smoke-0', 'sky-smoke-1', 'sky-smoke-2', 'sky-flame', 'sky-burst',
           'sky-glow', 'sky-flow', 'left-cloud-flow')),
    },
}
LEGACY_SCENES = {
    'nightfall': ('Ночной рубеж', 'Дождливый город, транспорт и огни над каналами', 'city.png', 'weather', 'Дождь'),
    'polar': ('Полярный сигнал', 'Северное сияние над забытой станцией', 'polar.png', 'weather', 'Снег'),
    'station': ('Дальний рубеж', 'Огни станции, пар и работающие механизмы', 'station.png', 'activity', 'Активность станции'),
    'abyss': ('Бездна', 'Жизнь под водой, прожекторы, лифт и переходы', 'abyss.png', 'flow', 'Сила течения'),
    'junction': ('Ночной узел', 'Дальний поезд, разноцветный трафик, пар и окна', 'junction.png', 'weather', 'Дождь'),
    'cloudcity': ('Город над облаками', 'Облачный океан, турбины, огни и далёкая гроза', 'cloudcity.png', 'flow', 'Сила ветра'),
    'titans': ('Пепел титанов', 'Пожары, дым и падающие дредноуты', 'titans.png', 'activity', 'Активность на планете'),
}


class SceneError(ValueError):
    """A user-facing validation or storage error."""


def require(condition, message):
    if not condition:
        raise SceneError(message)


def integer(value, low=1, high=2**31 - 1):
    return type(value) is int and low <= value <= high


def parse_json(data, limit=MAX_JSON):
    require(len(data) <= limit, 'JSON превышает допустимый размер')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Повторяющийся ключ JSON')
            result[key] = value
        return result
    def finite_float(text):
        number = float(text)
        require(math.isfinite(number), 'Неконечное число JSON')
        return number
    try:
        return json.loads(data, object_pairs_hook=pairs, parse_float=finite_float,
                          parse_constant=lambda value: (_ for _ in ()).throw(SceneError('Неконечное число JSON')))
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise SceneError('Повреждён JSON') from exc


def clean_path(value):
    require(isinstance(value, str) and len(value) <= 240 and '\\' not in value,
            'Недопустимый путь файла')
    parts = value.split('/')
    require(all(PART_RE.fullmatch(p) and p not in ('.', '..') for p in parts), 'Недопустимый путь файла')
    return value


def allowed_asset(value):
    clean_path(value)
    return value in NOTICES or (value.startswith('assets/') and Path(value).suffix in ('.png', '.json'))


def metadata(value):
    require(isinstance(value, dict), 'Метаданные сцены должны быть объектом')
    require(isinstance(value.get('id'), str) and ID_RE.fullmatch(value['id']) is not None, 'Недопустимый идентификатор сцены')
    require(integer(value.get('version')), 'Недопустимая версия сцены')
    require(isinstance(value.get('renderer'), str) and value['renderer'] in RENDERERS, 'Неподдерживаемый движок сцены')
    for key, maximum in {'name': 120, 'subtitle': 300, 'description': 2400, 'author': 160,
                         'license': 120, 'weatherLabel': 80}.items():
        text = value.get(key)
        require(isinstance(text, str) and 0 < len(text) <= maximum and '\x00' not in text,
                f'Недопустимое поле {key}')
    for key in ('tag', 'detail'):
        require(key not in value or (isinstance(value[key], str) and len(value[key]) <= 300), f'Недопустимое поле {key}')
    require(value.get('width') == 1672 and type(value.get('width')) is int and value.get('height') == 941
            and type(value.get('height')) is int, 'Размер сцены должен быть 1672 × 941')
    require(value.get('control') in ('weather', 'flow', 'activity'), 'Недопустимый регулятор сцены')
    image = value.get('image', '')
    clean_path(image)
    require(re.fullmatch(r'assets/[A-Za-z0-9_-]+\.png', image) is not None,
            'Фоновое изображение должно быть PNG в assets/')
    return value


def validate_manifest(value):
    metadata(value)
    require(type(value.get('formatVersion')) is int and value['formatVersion'] == 1, 'Неизвестный формат пакета')
    fields = {'formatVersion', 'id', 'version', 'name', 'subtitle', 'description', 'author', 'license',
              'renderer', 'image', 'width', 'height', 'control', 'weatherLabel', 'files', 'tag', 'detail'}
    require(not (set(value) - fields), 'Неизвестное поле манифеста')
    files = value.get('files')
    require(isinstance(files, dict) and 1 <= len(files) <= MAX_FILES, 'Недопустимый список файлов')
    total = 0
    for name, descriptor in files.items():
        require(allowed_asset(name), 'Пакет может содержать только PNG, JSON и лицензию')
        require(isinstance(descriptor, dict) and set(descriptor) == {'sha256', 'bytes'}, 'Недопустимая контрольная сумма файла')
        require(isinstance(descriptor['sha256'], str) and HASH_RE.fullmatch(descriptor['sha256']), 'Недопустимый SHA-256')
        limit = MAX_JSON if name.endswith('.json') or name in NOTICES else MAX_FILE
        require(integer(descriptor['bytes'], 1, limit), 'Недопустимый размер файла')
        total += descriptor['bytes']
    require(total <= MAX_ARCHIVE, 'Пакет превышает допустимый размер')
    require({value['image']} | REQUIRED_ASSETS[value['renderer']] <= set(files), 'Отсутствуют обязательные слои сцены')
    return value


def validate_url(url, kind='catalog', redirect=False):
    require(isinstance(url, str) and len(url) <= 4096, 'Недопустимый URL')
    try:
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise SceneError('Недопустимый URL') from exc
    require(parsed.scheme == 'https' and parsed.username is None and parsed.password is None
            and port in (None, 443) and not parsed.fragment, 'Требуется защищённый адрес GitHub')
    require('%' not in parsed.path and '\\' not in parsed.path and all(p not in ('.', '..') for p in parsed.path.split('/')),
            'Недопустимый путь URL')
    if kind == 'package':
        valid = parsed.hostname == 'github.com' and parsed.path.startswith(RELEASE_PREFIX) and len(parsed.path) > len(RELEASE_PREFIX)
        valid = valid or (redirect and parsed.hostname == 'release-assets.githubusercontent.com')
        require(valid, 'Пакеты загружаются только из релизов Nightfall на GitHub')
    else:
        require(parsed.hostname == 'tanosxx.github.io' and parsed.path.startswith(PAGES_PREFIX) and not parsed.query,
                'Каталог и обложки загружаются только с сайта Nightfall')
        if kind == 'catalog':
            require(url == CATALOG_URL, 'Неизвестный каталог')
    return url


def validate_catalog(value):
    require(isinstance(value, dict) and value.get('formatVersion') == 1 and type(value.get('formatVersion')) is int,
            'Неизвестный формат каталога')
    require(type(value.get('engineVersion')) is int and value['engineVersion'] == ENGINE_VERSION,
            'Каталог требует другую версию Nightfall')
    scenes = value.get('scenes')
    require(isinstance(scenes, list) and len(scenes) <= 500, 'Недопустимый каталог')
    seen = set()
    for scene in scenes:
        metadata(scene)
        require(scene['id'] not in seen, 'Повторяющаяся сцена каталога')
        seen.add(scene['id'])
        validate_url(scene.get('previewUrl'), 'preview')
        if 'previewSha256' in scene or 'previewBytes' in scene:
            require(isinstance(scene.get('previewSha256'), str) and HASH_RE.fullmatch(scene['previewSha256']), 'Недопустимый SHA-256 обложки')
            require(integer(scene.get('previewBytes'), 1, MAX_PREVIEW), 'Недопустимый размер обложки')
        package = scene.get('package')
        require(isinstance(package, dict) and set(package) == {'url', 'sha256', 'bytes'}, 'Недопустимый пакет каталога')
        validate_url(package['url'], 'package')
        require(isinstance(package['sha256'], str) and HASH_RE.fullmatch(package['sha256']), 'Недопустимый SHA-256 пакета')
        require(integer(package['bytes'], 1, MAX_ARCHIVE), 'Недопустимый размер пакета')
    return value


def validate_png(data):
    """Check PNG chunks/CRC and bounded decoded scanlines before native decoding."""
    require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Файл не является PNG')
    offset = 8
    header = None
    compressed = bytearray()
    ended = False
    palette = False
    while offset < len(data):
        require(offset + 12 <= len(data), 'Обрезанный PNG')
        size, kind = struct.unpack('>I4s', data[offset:offset + 8])
        require(size <= MAX_FILE and offset + size + 12 <= len(data), 'Недопустимый блок PNG')
        body = data[offset + 8:offset + 8 + size]
        crc = struct.unpack('>I', data[offset + 8 + size:offset + 12 + size])[0]
        require(zlib.crc32(kind + body) & 0xffffffff == crc, 'Повреждена контрольная сумма PNG')
        require(header is not None or kind == b'IHDR', 'PNG должен начинаться с IHDR')
        if kind == b'IHDR':
            require(header is None and size == 13, 'Недопустимый заголовок PNG')
            header = struct.unpack('>IIBBBBB', body)
            width, height, bits, color, compression, filtering, interlace = header
            require(0 < width <= 8192 and 0 < height <= 8192 and width * height <= MAX_PIXELS, 'PNG слишком большой')
            depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
            require(color in depths and bits in depths[color] and compression == filtering == interlace == 0,
                    'Пакет поддерживает обычные PNG без чересстрочной развёртки')
        elif kind == b'PLTE':
            require(not compressed and size > 0 and size % 3 == 0 and size <= 768, 'Недопустимая палитра PNG')
            palette = True
        elif kind == b'IDAT':
            require(not ended, 'Нарушен порядок блоков PNG')
            compressed.extend(body)
        elif kind == b'IEND':
            require(size == 0 and offset + 12 == len(data), 'Данные после конца PNG')
            break
        else:
            require(kind[0] & 32, 'Неизвестный обязательный блок PNG')
            if compressed:
                ended = True
        offset += size + 12
    else:
        raise SceneError('PNG не завершён')
    require(compressed and (header[3] != 3 or palette), 'Нет изображения PNG')
    width, height, bits, color, *_ = header
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    row = (width * channels * bits + 7) // 8 + 1
    expected = row * height
    require(expected <= 128 * 1024 * 1024, 'Распакованный PNG слишком большой')
    try:
        decoder = zlib.decompressobj()
        pixels = decoder.decompress(compressed, expected + 1)
        require(len(pixels) == expected and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,
                'Повреждён или чрезмерно распаковывается PNG')
        require(all(pixels[y * row] <= 4 for y in range(height)), 'Недопустимый фильтр PNG')
    except zlib.error as exc:
        raise SceneError('Повреждены пиксели PNG') from exc
    # Cairo expands grayscale/indexed/low-bit-depth PNGs into 32-bit native
    # surfaces. Counting only PNG scanlines would let tiny monochrome atlases
    # consume gigabytes in Shell despite the aggregate installation limit.
    return width, height, max(expected, width * height * 4)


def validate_station_json(value, files):
    require(isinstance(value, dict), 'Недопустимое освещение станции')
    require(value.get('dark') == 'dark.png', 'Недопустимая маска станции')
    layers = value.get('layers')
    require(isinstance(layers, list) and layers == ['light-%02d.png' % i for i in range(12)], 'Недопустимые слои станции')
    sectors = value.get('sectors')
    require(isinstance(sectors, list) and len(sectors) == 3, 'Недопустимые секторы станции')
    for sector, name in zip(sectors, ('ring', 'spine', 'hangar')):
        require(isinstance(sector, dict) and sector.get('id') == name and sector.get('path') == f'sector-{name}.png',
                'Недопустимый путь сектора')
    welds = value.get('welds')
    require(isinstance(welds, list) and len(welds) == 2, 'Недопустимые сварочные слои')
    for i, weld in enumerate(welds):
        require(isinstance(weld, dict) and weld.get('path') == f'weld-{i}.png', 'Недопустимый путь сварочного слоя')
        for key in ('x', 'y', 'width', 'height'):
            require(type(weld.get(key)) in (int, float) and 0 <= weld[key] <= 8192, 'Недопустимые размеры сварочного слоя')


def validate_payload(name, data, manifest):
    descriptor = manifest['files'][name]
    require(len(data) == descriptor['bytes'] and hashlib.sha256(data).hexdigest() == descriptor['sha256'],
            f'Контрольная сумма не совпадает: {name}')
    if name.endswith('.png'):
        width, height, decoded = validate_png(data)
        if name == manifest['image']:
            require((width, height) == (1672, 941), 'Размер фона не совпадает с манифестом')
        return decoded
    if name.endswith('.json'):
        value = parse_json(data)
        if name == 'assets/station-relief/lighting.json':
            validate_station_json(value, manifest['files'])
    elif name in NOTICES:
        try:
            data.decode('utf-8')
        except UnicodeError as exc:
            raise SceneError('Лицензия должна быть текстом UTF-8') from exc
    return 0


def extract_package(archive, destination, expected=None):
    """Validate the complete ZIP before it can become an installed scene."""
    archive, destination = Path(archive), Path(destination)
    require(archive.is_file() and not archive.is_symlink() and archive.stat().st_size <= MAX_ARCHIVE, 'Недопустимый или слишком большой архив')
    require(not destination.is_symlink() and (not destination.exists() or (destination.is_dir() and not any(destination.iterdir()))),
            'Для распаковки нужна пустая папка')
    try:
        with zipfile.ZipFile(archive) as bundle:
            infos = bundle.infolist()
            require(1 < len(infos) <= MAX_FILES + 1, 'Недопустимое число файлов')
            names = set()
            total = 0
            for info in infos:
                clean_path(info.filename)
                require(info.orig_filename == info.filename, 'Недопустимое имя ZIP-файла')
                require(info.filename not in names, 'Повторяющийся путь в архиве')
                names.add(info.filename)
                mode = info.external_attr >> 16
                require(not info.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG), 'Ссылки и специальные файлы запрещены')
                require(not info.flag_bits & 1 and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                        'Неподдерживаемое сжатие архива')
                require(0 < info.file_size <= MAX_FILE and info.file_size <= max(info.compress_size, 1) * 2000,
                        'Архив чрезмерно распаковывается')
                total += info.file_size
            require(total <= MAX_ARCHIVE and 'scene.json' in names, 'Отсутствует манифест или архив слишком большой')
            require(bundle.getinfo('scene.json').file_size <= MAX_JSON, 'Манифест слишком большой')
            manifest = validate_manifest(parse_json(bundle.read('scene.json')))
            require(names == {'scene.json'} | set(manifest['files']), 'Состав архива не совпадает с манифестом')
            if expected:
                for field in ('id', 'version', 'renderer', 'image', 'width', 'height', 'control'):
                    require(manifest[field] == expected[field], 'Пакет не соответствует выбранной сцене')
            decoded = 0
            for name, descriptor in manifest['files'].items():
                require(bundle.getinfo(name).file_size == descriptor['bytes'], 'Размер файла не совпадает с манифестом')
                data = bundle.read(name)
                decoded += validate_payload(name, data, manifest)
                require(decoded <= MAX_DECODED, 'Суммарный размер изображений слишком большой')
                path = destination / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                path.chmod(0o600)
            (destination / 'scene.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
            return manifest
    except (zipfile.BadZipFile, RuntimeError, EOFError) as exc:
        raise SceneError('Повреждён ZIP-архив') from exc


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, kind):
        super().__init__()
        self.kind = kind

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        validate_url(newurl, self.kind, redirect=True)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def download(url, target, limit, expected_bytes=None, expected_hash=None, kind='catalog'):
    validate_url(url, kind)
    request = urllib.request.Request(url, headers={'User-Agent': 'Nightfall-scene-manager/1', 'Accept-Encoding': 'identity'})
    opener = urllib.request.build_opener(SafeRedirect(kind))
    digest = hashlib.sha256()
    count = 0
    start = time.monotonic()
    try:
        with opener.open(request, timeout=20) as response, Path(target).open('xb') as output:
            validate_url(response.geturl(), kind, redirect=True)
            require(response.headers.get('Content-Encoding', 'identity') == 'identity', 'Неожиданное HTTP-сжатие')
            length = response.headers.get('Content-Length')
            if length:
                require(length.isdigit() and int(length) <= limit, 'Загрузка превышает допустимый размер')
                if expected_bytes is not None:
                    require(int(length) == expected_bytes, 'Размер загрузки не совпадает с каталогом')
            while True:
                chunk = response.read(min(65536, limit - count + 1))
                if not chunk:
                    break
                count += len(chunk)
                require(count <= limit and time.monotonic() - start <= 180, 'Превышен лимит загрузки')
                digest.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        require(expected_bytes is None or count == expected_bytes, 'Загрузка неполная')
        require(expected_hash is None or digest.hexdigest() == expected_hash, 'Контрольная сумма загрузки не совпадает')
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SceneError('Не удалось загрузить данные GitHub. Проверьте подключение к сети.') from exc


def safe_file(path, root):
    path = Path(path)
    root = Path(root)
    require(path.is_relative_to(root), 'Путь выходит за папку сцен')
    cursor = root
    require(not root.is_symlink(), 'Символическая ссылка вместо папки данных')
    for part in path.relative_to(root).parts:
        cursor /= part
        require(not cursor.is_symlink(), 'Символические ссылки в папке сцен запрещены')
    return path


def read_limited(path, limit):
    require(path.is_file() and path.stat().st_size <= limit, 'Файл отсутствует или превышает допустимый размер')
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    require(len(data) <= limit, 'Файл превышает допустимый размер')
    return data


def atomic_json(path, value):
    safe_file(path, path.parent)
    descriptor, temporary = tempfile.mkstemp(prefix='.json-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(value, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        folder = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(folder)
        finally:
            os.close(folder)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class SceneManager:
    def __init__(self, data_dir=None, downloader=download, cache_dir=None):
        data_home = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share')
        cache_home = Path(os.environ.get('XDG_CACHE_HOME') or Path.home() / '.cache')
        require(data_home.is_absolute() and cache_home.is_absolute(), 'Каталог XDG должен быть абсолютным')
        self.root = Path(data_dir) if data_dir is not None else data_home / 'nightfall'
        require(self.root.is_absolute() and not self.root.is_symlink(), 'Недопустимая папка данных')
        self.root = self.root.resolve()
        self.cache = Path(cache_dir) if cache_dir else (self.root / 'cache' if data_dir is not None else cache_home / 'nightfall')
        require(self.cache.is_absolute() and not self.cache.is_symlink(), 'Недопустимая папка кэша')
        self.cache = self.cache.resolve()
        self.scenes = self.root / 'scenes'
        self.registry = self.scenes / 'registry.json'
        self.downloader = downloader
        for directory in (self.root, self.scenes, self.cache, self.cache / 'previews'):
            safe_file(directory, self.root if directory.is_relative_to(self.root) else self.cache)
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)

    @contextlib.contextmanager
    def lock(self):
        path = safe_file(self.root / '.lock', self.root)
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise SceneError('Другая операция со сценами ещё выполняется') from exc
            self.cleanup_staging()
            yield
        finally:
            os.close(descriptor)

    def cleanup_staging(self):
        for directory in (self.root, self.cache):
            for child in directory.glob('.stage-*'):
                safe_file(child, directory)
                if child.is_dir():
                    shutil.rmtree(child)
                elif child.is_file():
                    child.unlink()

    def records(self):
        if not self.registry.exists():
            return []
        safe_file(self.registry, self.root)
        value = parse_json(read_limited(self.registry, MAX_JSON))
        require(isinstance(value, dict) and value.get('formatVersion') == 1 and isinstance(value.get('scenes'), list),
                'Повреждён список установленных сцен')
        require(len(value['scenes']) <= 200, 'Слишком много установленных сцен')
        seen = set()
        for scene in value['scenes']:
            require(isinstance(scene, dict) and set(scene) == {'id', 'version'}, 'Недопустимая запись реестра')
            require(isinstance(scene['id'], str) and ID_RE.fullmatch(scene['id']) and integer(scene['version']), 'Недопустимая запись реестра')
            require(scene['id'] not in seen, 'Повторяющаяся запись реестра')
            seen.add(scene['id'])
        return value['scenes']

    def scene_root(self, record):
        return safe_file(self.scenes / record['id'] / str(record['version']), self.root)

    def installed(self):
        result, errors = [], []
        for record in self.records():
            try:
                path = self.scene_root(record)
                manifest = validate_manifest(parse_json(read_limited(safe_file(path / 'scene.json', self.root), MAX_JSON)))
                require(manifest['id'] == record['id'] and manifest['version'] == record['version'], 'Идентификатор сцены изменён')
                for name, descriptor in manifest['files'].items():
                    asset = safe_file(path / name, self.root)
                    require(asset.is_file() and asset.stat().st_size == descriptor['bytes'], 'Установленная сцена повреждена')
                result.append({**manifest, 'root': str(path), 'installed': True})
            except (SceneError, OSError) as exc:
                errors.append({'id': record['id'], 'error': str(exc)})
        return {'formatVersion': 1, 'scenes': result, 'errors': errors}

    def cached_catalog(self):
        path = safe_file(self.cache / 'catalog.json', self.cache)
        return validate_catalog(parse_json(read_limited(path, MAX_CATALOG), MAX_CATALOG))

    def refresh(self):
        with self.lock():
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=self.cache) as stage:
                path = Path(stage) / 'catalog.json'
                try:
                    self.downloader(CATALOG_URL, path, MAX_CATALOG, kind='catalog')
                    catalog = validate_catalog(parse_json(read_limited(path, MAX_CATALOG), MAX_CATALOG))
                    atomic_json(self.cache / 'catalog.json', catalog)
                    return {'catalog': catalog, 'cached': False}
                except (SceneError, OSError) as exc:
                    try:
                        catalog = self.cached_catalog()
                    except (SceneError, OSError):
                        raise exc
                    return {'catalog': catalog, 'cached': True, 'error': str(exc)}

    def catalog_scene(self, scene_id):
        require(isinstance(scene_id, str) and ID_RE.fullmatch(scene_id), 'Недопустимый идентификатор сцены')
        catalog = self.cached_catalog()
        scene = next((item for item in catalog['scenes'] if item['id'] == scene_id), None)
        require(scene is not None, 'Сцена отсутствует в каталоге. Обновите каталог.')
        return scene

    def commit_scene(self, staging, manifest, records):
        record = {'id': manifest['id'], 'version': manifest['version']}
        target = self.scene_root(record)
        current = next((item for item in records if item['id'] == record['id']), None)
        require(current is None or current['version'] < record['version'], 'Эта или более новая версия уже установлена')
        require(current is not None or len(records) < 200, 'Можно установить не более 200 сцен')
        target.parent.mkdir(exist_ok=True, mode=0o700)
        if target.exists():
            # An interrupted commit may leave an unregistered version. It is safe
            # to replace only that version, never the registry's current one.
            require(target.is_dir(), 'Недопустимая папка сцены')
            shutil.rmtree(target)
        os.replace(staging, target)
        next_records = [item for item in records if item['id'] != record['id']] + [record]
        atomic_json(self.registry, {'formatVersion': 1, 'scenes': next_records})
        return {**manifest, 'root': str(target), 'installed': True}

    def install(self, scene_id):
        require(scene_id != 'nightfall', 'Эта сцена уже встроена в Nightfall')
        with self.lock():
            scene = self.catalog_scene(scene_id)
            records = self.records()
            existing = next((item for item in records if item['id'] == scene_id), None)
            if existing and existing['version'] >= scene['version']:
                found = next((item for item in self.installed()['scenes'] if item['id'] == scene_id), None)
                require(found is not None, 'Установленная сцена повреждена. Удалите её и установите снова.')
                return {'ok': True, 'scene': found, 'unchanged': True}
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=self.root) as stage:
                stage = Path(stage)
                archive, unpacked = stage / 'package.zip', stage / 'scene'
                unpacked.mkdir()
                package = scene['package']
                self.downloader(package['url'], archive, package['bytes'], package['bytes'], package['sha256'], kind='package')
                # Recheck injected/downloaded bytes at the trust boundary.
                require(archive.stat().st_size == package['bytes'] and hashlib.sha256(archive.read_bytes()).hexdigest() == package['sha256'],
                        'Контрольная сумма пакета не совпадает с каталогом')
                manifest = extract_package(archive, unpacked, scene)
                installed = self.commit_scene(unpacked, manifest, records)
                return {'ok': True, 'scene': installed}

    def install_file(self, archive):
        archive = Path(archive).absolute()
        require(archive.is_file() and not archive.is_symlink(), 'Не найден файл пакета сцены')
        with self.lock():
            records = self.records()
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=self.root) as stage:
                unpacked = Path(stage) / 'scene'
                unpacked.mkdir()
                manifest = extract_package(archive, unpacked)
                require(manifest['id'] != 'nightfall', 'Эта сцена уже встроена в Nightfall')
                existing = next((item for item in records if item['id'] == manifest['id']), None)
                if existing:
                    require(existing['version'] <= manifest['version'], 'Более новая версия уже установлена')
                    if existing['version'] == manifest['version']:
                        previous = validate_manifest(parse_json(read_limited(self.scene_root(existing) / 'scene.json', MAX_JSON)))
                        require(previous == manifest, 'Эта версия уже установлена с другим содержимым. Повысьте версию пакета.')
                        for name in manifest['files']:
                            local = safe_file(self.scene_root(existing) / name, self.root)
                            validate_payload(name, read_limited(local, MAX_FILE), manifest)
                        found = next((item for item in self.installed()['scenes'] if item['id'] == manifest['id']), None)
                        require(found is not None, 'Установленная сцена повреждена. Удалите её и установите снова.')
                        return {'ok': True, 'scene': found, 'unchanged': True}
                installed = self.commit_scene(unpacked, manifest, records)
                return {'ok': True, 'scene': installed}

    def remove(self, scene_id):
        require(isinstance(scene_id, str) and ID_RE.fullmatch(scene_id), 'Недопустимый идентификатор сцены')
        require(scene_id != 'nightfall', 'Встроенную сцену удалить нельзя')
        with self.lock():
            records = self.records()
            updated = [item for item in records if item['id'] != scene_id]
            require(len(updated) < len(records), 'Сцена не установлена')
            target = safe_file(self.scenes / scene_id, self.root)
            atomic_json(self.registry, {'formatVersion': 1, 'scenes': updated})
            if target.exists():
                require(target.is_dir(), 'Недопустимая папка сцены')
                shutil.rmtree(target)
            return {'ok': True, 'removed': scene_id}

    def preview(self, scene_id):
        with self.lock():
            scene = self.catalog_scene(scene_id)
            require('previewSha256' in scene and 'previewBytes' in scene, 'Каталог не содержит проверяемую обложку')
            target = safe_file(self.cache / 'previews' / f"{scene_id}-{scene['version']}-{scene['previewSha256'][:16]}.png", self.cache)
            if target.exists():
                data = read_limited(target, MAX_PREVIEW)
                if len(data) == scene['previewBytes'] and hashlib.sha256(data).hexdigest() == scene['previewSha256']:
                    width, height, _ = validate_png(data)
                    require(width <= 2048 and height <= 2048, 'Обложка слишком большая')
                    return {'path': str(target)}
                target.unlink()
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=self.cache) as stage:
                temporary = Path(stage) / 'preview.png'
                self.downloader(scene['previewUrl'], temporary, scene['previewBytes'], scene['previewBytes'], scene['previewSha256'], kind='preview')
                data = read_limited(temporary, MAX_PREVIEW)
                require(len(data) == scene['previewBytes'] and hashlib.sha256(data).hexdigest() == scene['previewSha256'], 'Контрольная сумма обложки не совпадает')
                width, height, _ = validate_png(data)
                require(width <= 2048 and height <= 2048, 'Обложка слишком большая')
                os.replace(temporary, target)
            return {'path': str(target)}

    def import_bundled(self, source):
        source = Path(source).absolute()
        require(source.is_dir() and not source.is_symlink(), 'Не найдена прежняя установка Nightfall')
        imported, skipped = [], []
        with self.lock():
            records = self.records()
            present = {item['id'] for item in records}
            for scene_id, (name, subtitle, image, control, weather_label) in LEGACY_SCENES.items():
                if scene_id in present or scene_id == 'nightfall':
                    continue
                filenames = REQUIRED_ASSETS[scene_id] | {'assets/' + image}
                if not all(safe_file(source / filename, source).is_file() for filename in filenames):
                    skipped.append(scene_id)
                    continue
                manifest = {'formatVersion': 1, 'id': scene_id, 'version': 1, 'name': name, 'subtitle': subtitle,
                            'description': subtitle, 'author': 'tanosxx / Nightfall', 'license': 'GPL-3.0-only',
                            'renderer': scene_id, 'image': 'assets/' + image, 'width': 1672, 'height': 941,
                            'control': control, 'weatherLabel': weather_label, 'files': {}}
                for notice in NOTICES:
                    if safe_file(source / notice, source).is_file():
                        filenames.add(notice)
                with tempfile.TemporaryDirectory(prefix='.stage-', dir=self.root) as stage:
                    staging = Path(stage) / 'scene'
                    staging.mkdir()
                    payloads = {}
                    total = 0
                    for filename in sorted(filenames):
                        data = read_limited(source / filename, MAX_JSON if filename.endswith('.json') or filename in NOTICES else MAX_FILE)
                        total += len(data)
                        require(total <= MAX_ARCHIVE, 'Пакет превышает допустимый размер')
                        payloads[filename] = data
                        manifest['files'][filename] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                    validate_manifest(manifest)
                    decoded = 0
                    for filename, data in payloads.items():
                        decoded += validate_payload(filename, data, manifest)
                        require(decoded <= MAX_DECODED, 'Суммарный размер изображений слишком большой')
                        output = staging / filename
                        output.parent.mkdir(parents=True, exist_ok=True)
                        output.write_bytes(data)
                    atomic_json(staging / 'scene.json', manifest)
                    self.commit_scene(staging, manifest, records)
                    records = self.records()
                    present.add(scene_id)
                    imported.append(scene_id)
            return {'ok': True, 'imported': imported, 'skipped': skipped}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('list', 'refresh'):
        commands.add_parser(name)
    for name in ('install', 'remove', 'preview'):
        commands.add_parser(name).add_argument('id')
    commands.add_parser('import-bundled').add_argument('path', type=Path)
    commands.add_parser('install-file').add_argument('path', type=Path)
    args = parser.parse_args(argv)
    try:
        manager = SceneManager(args.data_dir)
        if args.command == 'list':
            result = manager.installed()
        elif args.command == 'refresh':
            result = manager.refresh()
        elif args.command == 'import-bundled':
            result = manager.import_bundled(args.path)
        elif args.command == 'install-file':
            result = manager.install_file(args.path)
        else:
            result = getattr(manager, args.command)(args.id)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (SceneError, OSError) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
