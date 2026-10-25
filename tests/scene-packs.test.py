#!/usr/bin/env python3
"""Real release packs: reproducibility, installation compatibility and boundaries."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


packs = module('nightfall_scene_packs', 'scripts/build-scene-packs.py')
manager = module('nightfall_scene_manager', 'extension/nightfall@local/scene-manager.py')


class ScenePackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT / 'dist').mkdir(exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix='packs-test-', dir=ROOT / 'dist')
        cls.output = Path(cls.temp.name)
        packs.build(cls.output)
        cls.catalog = json.loads((cls.output / 'catalog/index.json').read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_all_seven_real_packages_are_accepted_by_desktop_installer(self):
        manager.validate_catalog(self.catalog)
        with tempfile.TemporaryDirectory(prefix='nightfall-unpack-test-') as directory:
            for scene in self.catalog['scenes']:
                with self.subTest(scene=scene['id']):
                    archive = self.output / 'scenes' / scene['package']['url'].rsplit('/', 1)[1]
                    self.assertEqual(packs.digest(archive.read_bytes()), {k: scene['package'][k] for k in ('sha256', 'bytes')})
                    destination = Path(directory) / scene['id']
                    manager.extract_package(archive, destination, expected=scene)
                    manifest = json.loads((destination / 'scene.json').read_text())
                    self.assertTrue(manager.REQUIRED_ASSETS[scene['renderer']].issubset(manifest['files']))
                    self.assertTrue((destination / manifest['image']).is_file())
                    self.assertTrue(set(packs.NOTICES).issubset(manifest['files']))
                    self.assertNotIn('scene.json', manifest['files'])

    def test_build_is_byte_for_byte_reproducible(self):
        again = self.output / 'again'
        packs.build(again)
        for original in (self.output / 'scenes').glob('*.zip'):
            with self.subTest(file=original.name):
                self.assertEqual(original.read_bytes(), (again / 'scenes' / original.name).read_bytes())
        self.assertEqual((self.output / 'catalog/index.json').read_bytes(), (again / 'catalog/index.json').read_bytes())

    def test_archives_contain_only_plain_data_and_have_stable_permissions(self):
        for archive in (self.output / 'scenes').glob('*.zip'):
            with self.subTest(archive=archive.name), zipfile.ZipFile(archive) as bundle:
                self.assertEqual(bundle.namelist(), sorted(bundle.namelist()))
                for item in bundle.infolist():
                    self.assertFalse(item.is_dir())
                    self.assertTrue(item.filename == 'scene.json' or manager.allowed_asset(item.filename))
                    self.assertEqual(item.date_time, (1980, 1, 1, 0, 0, 0))
                    self.assertEqual((item.external_attr >> 16) & 0o777, 0o644)
                    self.assertEqual(item.compress_type, zipfile.ZIP_STORED)

    def test_public_thumbnails_match_catalogue_hashes(self):
        for scene in self.catalog['scenes']:
            data = (self.output / 'catalog/previews' / (scene['id'] + '.png')).read_bytes()
            self.assertEqual(packs.digest(data), {'bytes': scene['previewBytes'], 'sha256': scene['previewSha256']})
            self.assertLess(len(data), 300_000)
            self.assertEqual(scene['previewUrl'], packs.CATALOG_BASE + 'previews/' + scene['id'] + '.png')

    def test_source_selection_rejects_code_and_missing_required_texture(self):
        scene, source = packs.load_sources()[0]
        bad = copy.deepcopy(source)
        bad['assets'] = ['assets/city.png', 'library.js']
        with self.assertRaisesRegex(ValueError, 'below assets'):
            packs.collect_files(ROOT, scene, bad)
        station, source = next(pair for pair in packs.load_sources() if pair[0]['id'] == 'station')
        files = packs.collect_files(ROOT, station, source)
        del files['assets/station-native/nebula.png']
        with self.assertRaises(ValueError):
            packs.make_manifest(station, source, files)

    def test_community_scene_can_reuse_a_known_renderer(self):
        scene, source = next(pair for pair in packs.load_sources() if pair[0]['id'] == 'polar')
        scene = copy.deepcopy(scene)
        scene['id'] = 'community-polar'
        scene['renderer'] = 'polar'
        manifest = packs.make_manifest(scene, source, packs.collect_files(ROOT, scene, source))
        self.assertEqual(manifest['id'], 'community-polar')
        self.assertEqual(manifest['renderer'], 'polar')

    def test_safe_source_paths_and_release_urls(self):
        for path in ('../private.png', '/tmp/image.png', 'assets/../private.png', 'assets\\private.png'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                packs.safe_path(path)
        for base in ('http://github.com/', 'file:///tmp/', 'https://github.com/no-slash', 'https://github.com/?x=1'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                packs.checked_base(base)


if __name__ == '__main__':
    unittest.main()
