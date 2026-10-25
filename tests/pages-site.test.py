#!/usr/bin/env python3
"""Public build checks, including project-subpath links and privacy boundaries.

Run after python3 scripts/build-pages.py. Uses only the Python standard library.
"""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('nightfall_pages', ROOT / 'scripts' / 'build-pages.py')
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)
SITE = ROOT / 'dist' / 'site'


class PublicSiteTests(unittest.TestCase):
    def test_all_scene_links_and_transitive_modules_exist(self):
        self.assertTrue((SITE / 'index.html').is_file(), 'Run scripts/build-pages.py first')
        pages.validate_site(SITE)
        self.assertEqual(len(pages.entrypoints(SITE)), 8)

    def test_no_installer_tests_or_private_tree_is_published(self):
        manifest = json.loads((SITE / 'site-manifest.json').read_text())
        self.assertGreater(len(manifest['files']), 40)
        for file in manifest['files']:
            with self.subTest(file=file):
                self.assertTrue(pages.allowed_source(Path(file)))
                self.assertEqual((SITE / file).stat().st_size, manifest['files'][file]['bytes'])
        for forbidden in ['.git', '.github', 'tests', 'scripts', 'app', 'concepts', 'validation',
                          'install.sh', 'uninstall.sh', 'README.txt', 'station-3d.html',
                          'extension/nightfall@local/extension.js', 'extension/nightfall@local/prefs.js']:
            self.assertFalse((SITE / forbidden).exists(), forbidden)
        for notice in ['LICENSE', 'NOTICE.md', 'ASSETS.md', 'vendor/three/LICENSE']:
            self.assertEqual((SITE / notice).read_bytes(), (ROOT / notice).read_bytes())

    def test_project_subpath_resolution_and_remote_resources(self):
        self.assertEqual(pages.local_path(Path('index.html'), 'titans.html?embed=1&v=15'), Path('titans.html'))
        self.assertEqual(pages.local_path(Path('extension/nightfall@local/titans-ground.js'), './titans-smoke-flow.js?v=15'),
                         Path('extension/nightfall@local/titans-smoke-flow.js'))
        for url in ['/assets/city.png', '../../../secrets.json', 'https://cdn.example.com/module.js', 'gi://Gio']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                pages.local_path(Path('index.html'), url)
        self.assertIsNone(pages.local_path(Path('index.html'), 'https://github.com/tanosxx/nightfall-wallpaper', navigation=True))

    def test_missing_transitive_module_is_detected(self):
        module = SITE / 'extension/nightfall@local/titans-suit.js'
        original = module.read_bytes()
        try:
            module.unlink()
            with self.assertRaisesRegex(ValueError, 'titans-suit.js'):
                pages.validate_site(SITE)
        finally:
            module.write_bytes(original)

    def test_gallery_defers_images_and_public_links_exist(self):
        script = (SITE / 'library.js').read_text()
        html = (SITE / 'index.html').read_text()
        self.assertIn('<img data-src=', script)
        self.assertNotIn('<img src=', script)
        self.assertIn('loading="lazy"', script)
        self.assertIn('image.src=image.dataset.src', script)
        self.assertIn('https://github.com/tanosxx/nightfall-wallpaper/releases/latest', html)
        self.assertIn('aria-label="Nightfall на GitHub"', html)


if __name__ == '__main__':
    unittest.main()
