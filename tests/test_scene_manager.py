#!/usr/bin/env python3
"""Scene installation trust-boundary tests. No user's data or network is touched."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import os
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import warnings
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'extension/nightfall@local/scene-manager.py'
spec = importlib.util.spec_from_file_location('scene_manager', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def png(width=1672, height=941, value=0, bits=8):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = (b'\0' + bytes([value]) * ((width * bits + 7) // 8)) * height
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, bits, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


PHOTO = png()
THUMB = png(48, 27)
PACKAGE_URL = 'https://github.com/tanosxx/nightfall-wallpaper/releases/download/scenes-v1/polar-1.zip'
PREVIEW_URL = 'https://tanosxx.github.io/nightfall-wallpaper/catalog/previews/polar.png'


def manifest(scene_id='polar', version=1, files=None):
    files = files or {'assets/polar.png': PHOTO}
    return {'formatVersion': 1, 'id': scene_id, 'version': version, 'name': 'Полярный сигнал',
            'subtitle': 'Сияние над станцией', 'description': 'Полярная станция',
            'author': 'Nightfall', 'license': 'GPL-3.0-only', 'renderer': 'polar',
            'image': 'assets/polar.png', 'width': 1672, 'height': 941,
            'control': 'weather', 'weatherLabel': 'Снег',
            'files': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)} for name, data in files.items()}}


def archive_bytes(info=None, files=None, extra=None):
    files = files or {'assets/polar.png': PHOTO}
    info = info or manifest(files=files)
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as archive:
        archive.writestr('scene.json', json.dumps(info, ensure_ascii=False))
        for name, data in files.items():
            archive.writestr(name, data)
        for name, data in extra or []:
            archive.writestr(name, data)
    return out.getvalue()


def catalog(package, info=None):
    info = info or manifest()
    scene = {k: v for k, v in info.items() if k not in ('files', 'formatVersion')}
    scene.update(previewUrl=PREVIEW_URL, previewSha256=hashlib.sha256(THUMB).hexdigest(), previewBytes=len(THUMB),
                 package={'url': PACKAGE_URL, 'sha256': hashlib.sha256(package).hexdigest(), 'bytes': len(package)})
    return {'formatVersion': 1, 'engineVersion': 1, 'scenes': [scene]}


class SceneManagerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='nightfall-manager-test-')
        self.root = Path(self.temporary.name)
        self.package = archive_bytes()
        self.index = catalog(self.package)
        self.calls = []
        self.responses = {m.CATALOG_URL: json.dumps(self.index).encode(), PACKAGE_URL: self.package, PREVIEW_URL: THUMB}
        def fetch(url, path, limit, expected_bytes=None, expected_hash=None, kind='catalog'):
            self.calls.append((url, kind))
            value = self.responses[url]
            if isinstance(value, Exception):
                raise value
            Path(path).write_bytes(value)
        self.fetch = fetch
        self.manager = m.SceneManager(self.root / 'data', downloader=fetch)

    def tearDown(self):
        self.temporary.cleanup()

    def zip_path(self, data=None):
        path = self.root / 'scene.zip'
        path.write_bytes(data or self.package)
        return path

    def install(self):
        self.manager.refresh()
        return self.manager.install('polar')

    def test_install_registry_and_offline_list_remove(self):
        result = self.install()
        self.assertTrue(result['ok'])
        self.assertEqual(self.manager.registry, self.root / 'data/scenes/registry.json')
        self.assertEqual(json.loads(self.manager.registry.read_text()), {'formatVersion': 1, 'scenes': [{'id': 'polar', 'version': 1}]})
        self.assertEqual(self.manager.installed()['scenes'][0]['root'], str(self.root / 'data/scenes/polar/1'))
        calls = len(self.calls)
        self.assertTrue(self.manager.install('polar')['unchanged'])
        self.assertEqual(len(self.calls), calls)
        self.assertEqual(self.manager.remove('polar')['removed'], 'polar')
        self.assertEqual(self.manager.installed()['scenes'], [])
        self.assertFalse((self.root / 'data/scenes/polar').exists())

    def test_refresh_offline_uses_only_validated_cache(self):
        self.assertFalse(self.manager.refresh()['cached'])
        self.responses[m.CATALOG_URL] = m.SceneError('offline')
        self.assertTrue(self.manager.refresh()['cached'])
        self.manager.cache.joinpath('catalog.json').write_text('{}')
        with self.assertRaisesRegex(m.SceneError, 'offline'):
            self.manager.refresh()

    def test_bad_new_catalog_keeps_previous_cache(self):
        self.manager.refresh()
        self.responses[m.CATALOG_URL] = b'{"formatVersion":2}'
        self.assertTrue(self.manager.refresh()['cached'])
        self.assertEqual(self.manager.cached_catalog(), self.index)

    def test_download_hash_mismatch_never_installs(self):
        self.manager.refresh()
        self.responses[PACKAGE_URL] = self.package[:-1] + b'x'
        with self.assertRaises(m.SceneError):
            self.manager.install('polar')
        self.assertEqual(self.manager.installed()['scenes'], [])
        self.assertEqual(list(self.manager.root.glob('.stage-*')), [])

    def test_local_package_install_is_offline_and_idempotent(self):
        path = self.zip_path()
        self.manager.install_file(path)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.install_file(path)['unchanged'])
        changed = manifest()
        changed['description'] = 'Изменённое содержимое'
        with self.assertRaisesRegex(m.SceneError, 'другим содержимым'):
            self.manager.install_file(self.zip_path(archive_bytes(changed)))
        self.assertEqual(self.manager.installed()['scenes'][0]['description'], 'Полярная станция')

    def test_update_failure_before_registry_commit_keeps_old_install(self):
        self.manager.install_file(self.zip_path())
        upgraded = manifest(version=2)
        path = self.zip_path(archive_bytes(upgraded))
        with mock.patch.object(m, 'atomic_json', side_effect=OSError('simulated interruption')):
            with self.assertRaises(OSError):
                self.manager.install_file(path)
        self.assertEqual(self.manager.installed()['scenes'][0]['version'], 1)
        self.assertTrue((self.manager.scenes / 'polar/1/assets/polar.png').exists())
        self.manager.install_file(path)
        self.assertEqual(self.manager.installed()['scenes'][0]['version'], 2)
        with self.assertRaisesRegex(m.SceneError, 'Более новая'):
            self.manager.install_file(self.zip_path(self.package))

    def test_remove_failure_does_not_change_registry(self):
        self.install()
        with mock.patch.object(m, 'atomic_json', side_effect=OSError('simulated interruption')):
            with self.assertRaises(OSError):
                self.manager.remove('polar')
        self.assertEqual(self.manager.installed()['scenes'][0]['id'], 'polar')

    def test_metadata_must_match_catalog_selection(self):
        other = manifest(scene_id='different')
        package = archive_bytes(other)
        self.responses[PACKAGE_URL] = package
        self.index = catalog(package)
        self.responses[m.CATALOG_URL] = json.dumps(self.index).encode()
        self.manager.refresh()
        with self.assertRaisesRegex(m.SceneError, 'не соответствует'):
            self.manager.install('polar')

    def test_path_traversal_symlinks_duplicates_and_code_are_rejected(self):
        cases = ['../evil', '/tmp/evil', 'assets/../evil.png', 'assets\\evil.png', 'assets//evil.png', '.hidden', 'assets/x.js']
        for name in cases:
            with self.subTest(name=name), self.assertRaises(m.SceneError):
                self.manager.install_file(self.zip_path(archive_bytes(extra=[(name, b'bad')])) )
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            duplicate = archive_bytes(extra=[('assets/polar.png', PHOTO)])
        with self.assertRaisesRegex(m.SceneError, 'Повторяющийся'):
            self.manager.install_file(self.zip_path(duplicate))
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as bundle:
            bundle.writestr('scene.json', json.dumps(manifest()))
            link = zipfile.ZipInfo('assets/polar.png')
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(link, '/etc/passwd')
        with self.assertRaisesRegex(m.SceneError, 'Ссылки'):
            self.manager.install_file(self.zip_path(out.getvalue()))
        self.assertEqual(self.manager.installed()['scenes'], [])

    def test_missing_extra_corrupted_payload_and_background_dimensions(self):
        for package in [archive_bytes(extra=[('assets/extra.png', PHOTO)]),
                        archive_bytes(files={'assets/polar.png': PHOTO + b'x'}, info=manifest()),
                        archive_bytes(files={'assets/polar.png': png(48, 27)})]:
            with self.subTest(size=len(package)), self.assertRaises(m.SceneError):
                self.manager.install_file(self.zip_path(package))
        required = manifest()
        required['renderer'] = 'station'
        with self.assertRaisesRegex(m.SceneError, 'обязательные'):
            m.validate_manifest(required)

    def test_manifest_type_errors_are_clean_validation_errors(self):
        for key, value in [('id', 1), ('renderer', []), ('version', True), ('width', True),
                           ('files', []), ('image', '../../outside.png'), ('root', '/tmp')]:
            candidate = manifest()
            candidate[key] = value
            with self.subTest(key=key), self.assertRaises(m.SceneError):
                m.validate_manifest(candidate)
        with self.assertRaises(m.SceneError):
            m.parse_json(b'{"id":"a","id":"b"}')
        with self.assertRaises(m.SceneError):
            m.parse_json(b'{"number":NaN}')
        with self.assertRaises(m.SceneError):
            m.parse_json(b'{"number":1e999}')

    def test_png_crc_truncation_oversize_and_zipbomb_are_rejected(self):
        for data in [PHOTO[:-5], PHOTO[:40] + b'bad' + PHOTO[43:], PHOTO + b'trailing']:
            with self.assertRaises(m.SceneError):
                m.validate_png(data)
        huge = bytearray(PHOTO)
        huge[16:20] = struct.pack('>I', 90000)
        huge[29:33] = struct.pack('>I', zlib.crc32(huge[12:29]) & 0xffffffff)
        with self.assertRaisesRegex(m.SceneError, 'слишком большой'):
            m.validate_png(bytes(huge))
        with mock.patch.object(m, 'MAX_FILE', 100):
            with self.assertRaises(m.SceneError):
                self.manager.install_file(self.zip_path())

    def test_monochrome_atlases_count_full_cairo_surfaces_and_reject_oversized_scene(self):
        atlas = png(2048, 2048, bits=1)
        self.assertEqual(m.validate_png(atlas), (2048, 2048, 2048 * 2048 * 4))
        # 88 small monochrome files occupy about 44 MiB as PNG scanlines but
        # would become 1.4 GiB of Cairo surfaces in the desktop process.
        files = {name: atlas for name in m.REQUIRED_ASSETS['abyss']}
        files['assets/abyss.png'] = PHOTO
        metadata = manifest('abyss', files=files)
        metadata.update(renderer='abyss', image='assets/abyss.png')
        archive = self.zip_path(archive_bytes(metadata, files=files))
        with self.assertRaisesRegex(m.SceneError, 'Суммарный размер'):
            self.manager.install_file(archive)
        self.assertEqual(self.manager.installed()['scenes'], [])
        self.assertFalse((self.manager.scenes / 'abyss/1').exists())
        self.assertEqual(list(self.manager.root.glob('.stage-*')), [])
        # Upgrades from an old bundled installation use the same memory limit.
        source = self.root / 'old-oversized-extension'
        for name, data in files.items():
            target = source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        with self.assertRaisesRegex(m.SceneError, 'Суммарный размер'):
            self.manager.import_bundled(source)
        self.assertEqual(self.manager.installed()['scenes'], [])
        self.assertFalse((self.manager.scenes / 'abyss/1').exists())

    def test_url_allowlist_covers_redirects_and_encoded_escape(self):
        m.validate_url(PACKAGE_URL, 'package')
        m.validate_url('https://release-assets.githubusercontent.com/test?signature=abc', 'package', redirect=True)
        for url in ['http://github.com/tanosxx/nightfall-wallpaper/releases/download/x/a.zip',
                    'https://github.com/evil/repo/releases/download/x/a.zip',
                    'https://github.com/tanosxx/nightfall-wallpaper/releases/download/../x/a.zip',
                    'https://github.com/tanosxx/nightfall-wallpaper/releases/download/%2e%2e/x',
                    'https://github.com@evil.test/tanosxx/nightfall-wallpaper/releases/download/x/a.zip',
                    'https://github.com:444/tanosxx/nightfall-wallpaper/releases/download/x/a.zip',
                    'https://release-assets.githubusercontent.com/test']:
            with self.subTest(url=url), self.assertRaises(m.SceneError):
                m.validate_url(url, 'package')
        with self.assertRaises(m.SceneError):
            m.SafeRedirect('package').redirect_request(None, None, 302, '', {}, 'http://localhost/secret')
        with self.assertRaises(m.SceneError):
            m.validate_url('https://tanosxx.github.io/other/catalog.json')

    def test_station_json_cannot_reference_external_files(self):
        value = json.loads((ROOT / 'assets/station-relief/lighting.json').read_text())
        m.validate_station_json(value, {})
        value['layers'][0] = '../../../../private.png'
        with self.assertRaises(m.SceneError):
            m.validate_station_json(value, {})

    def test_registry_never_uses_external_root_and_symlinks(self):
        self.install()
        records = json.loads(self.manager.registry.read_text())
        records['scenes'][0]['root'] = str(self.root)
        self.manager.registry.write_text(json.dumps(records))
        with self.assertRaises(m.SceneError):
            self.manager.installed()
        self.manager.registry.write_text(json.dumps({'formatVersion': 1, 'scenes': [{'id': 'polar', 'version': 1}]}))
        image = self.manager.scenes / 'polar/1/assets/polar.png'
        image.unlink()
        image.symlink_to(self.zip_path())
        self.assertEqual(self.manager.installed()['scenes'], [])
        self.assertEqual(len(self.manager.installed()['errors']), 1)

    def test_concurrent_mutations_are_rejected_and_stale_stages_cleaned(self):
        stale = self.manager.root / '.stage-abandoned'
        stale.mkdir()
        (stale / 'partial').write_text('unfinished')
        with self.manager.lock():
            self.assertFalse(stale.exists())
            with self.assertRaisesRegex(m.SceneError, 'Другая операция'):
                self.manager.refresh()

    def test_previews_verified_cached_and_offline(self):
        self.manager.refresh()
        result = self.manager.preview('polar')
        self.assertEqual(Path(result['path']).read_bytes(), THUMB)
        calls = len(self.calls)
        self.responses[PREVIEW_URL] = m.SceneError('offline')
        self.assertEqual(self.manager.preview('polar'), result)
        self.assertEqual(len(self.calls), calls)
        Path(result['path']).write_bytes(b'invalid')
        with self.assertRaises(m.SceneError):
            self.manager.preview('polar')

    def test_import_keeps_existing_and_only_copies_required_data(self):
        source = self.root / 'old-extension'
        (source / 'assets').mkdir(parents=True)
        (source / 'assets/polar.png').write_bytes(PHOTO)
        (source / 'extension.js').write_text('must never be copied')
        (source / 'LICENSE').write_text('Example license')
        first = self.manager.import_bundled(source)
        self.assertEqual(first['imported'], ['polar'])
        self.assertFalse((self.manager.scenes / 'polar/1/extension.js').exists())
        (source / 'assets/polar.png').write_bytes(b'changed later')
        self.assertEqual(self.manager.import_bundled(source)['imported'], [])
        self.assertEqual(self.manager.installed()['scenes'][0]['id'], 'polar')

    def test_bundled_scene_is_not_removable_or_shadowable(self):
        with self.assertRaises(m.SceneError):
            self.manager.remove('nightfall')
        with self.assertRaises(m.SceneError):
            self.manager.install('nightfall')
        with self.assertRaises(m.SceneError):
            self.manager.install_file(self.zip_path(archive_bytes(manifest(scene_id='nightfall'))))

    def test_process_death_before_commit_keeps_previous_scene(self):
        self.manager.install_file(self.zip_path())
        path = self.zip_path(archive_bytes(manifest(version=2)))
        code = """
import importlib.util, os, signal, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('manager', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
manager = m.SceneManager(Path(sys.argv[2]))
def interrupted(*args):
    os.kill(os.getpid(), signal.SIGTERM)
m.atomic_json = interrupted
manager.install_file(Path(sys.argv[3]))
"""
        child = subprocess.run([sys.executable, '-c', code, str(SCRIPT), str(self.manager.root), str(path)], capture_output=True)
        self.assertEqual(child.returncode, -15)
        self.assertEqual(self.manager.installed()['scenes'][0]['version'], 1)
        self.manager.install_file(path)
        self.assertEqual(self.manager.installed()['scenes'][0]['version'], 2)
        self.assertEqual(list(self.manager.root.glob('.stage-*')), [])

    def test_local_reinstall_detects_same_size_disk_corruption(self):
        path = self.zip_path()
        installed = self.manager.install_file(path)['scene']
        photo = Path(installed['root']) / 'assets/polar.png'
        data = bytearray(photo.read_bytes())
        data[-1] ^= 1
        photo.write_bytes(data)
        with self.assertRaisesRegex(m.SceneError, 'Контрольная сумма'):
            self.manager.install_file(path)

    def test_download_rejects_partial_body_bad_hash_and_oversized_stream(self):
        class Response(io.BytesIO):
            headers = {}
            def geturl(self):
                return PACKAGE_URL
        class Opener:
            def open(self, *_args, **_kwargs):
                return Response(b'abc')
        with mock.patch.object(m.urllib.request, 'build_opener', return_value=Opener()):
            for limit, length, digest in [(5, 5, None), (5, 3, '0' * 64), (2, None, None)]:
                target = self.root / ('download-%s-%s' % (limit, length))
                target.unlink(missing_ok=True)
                with self.assertRaises(m.SceneError):
                    m.download(PACKAGE_URL, target, limit, length, digest, kind='package')
            target = self.root / 'download-ok'
            m.download(PACKAGE_URL, target, 3, 3, hashlib.sha256(b'abc').hexdigest(), kind='package')
            self.assertEqual(target.read_bytes(), b'abc')

    def test_cli_list_and_failure_are_machine_readable(self):
        command = [sys.executable, str(SCRIPT), '--data-dir', str(self.root / 'cli-data')]
        listing = subprocess.run(command + ['list'], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(listing.stdout)['scenes'], [])
        failure = subprocess.run(command + ['remove', '../bad'], capture_output=True, text=True)
        self.assertEqual(failure.returncode, 1)
        self.assertFalse(json.loads(failure.stdout)['ok'])
        self.assertNotIn('Traceback', failure.stderr)


if __name__ == '__main__':
    unittest.main()
