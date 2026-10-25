"""Release verification must fail before installation or any ZIP extraction."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import warnings
from zipfile import ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify_bundle', ROOT/'scripts/verify-bundle.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class VerifyBundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def bundle(self, *, extra=None, metadata_change=None, manifest_change=None, mutate=None):
        files = {name: b'fixture data' for name in checker.REQUIRED}
        metadata = {'uuid':checker.UUID, 'version':15, 'shell-version':['50'],
                    'settings-schema':'org.gnome.shell.extensions.nightfall'}
        if metadata_change:
            metadata.update(metadata_change)
        files['metadata.json'] = json.dumps(metadata).encode()
        if extra:
            files.update(extra)
        manifest = {'version':15, 'scenes':checker.SCENES,
                    'files':{name:hashlib.sha256(data).hexdigest() for name,data in files.items()}}
        if manifest_change:
            manifest_change(manifest)
        files['bundle-manifest.json'] = json.dumps(manifest).encode()
        if mutate:
            mutate(files)
        path = self.directory/'bundle.zip'
        with ZipFile(path, 'w') as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        return path

    def test_valid_bundle_extracts_only_fixed_files(self):
        path = self.bundle(extra={'extra.js':b'not extracted'})
        destination = self.directory/'installer'
        result = checker.verify_bundle(path, destination)
        self.assertEqual(result['version'], 15)
        self.assertEqual(sorted(str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file()),
                         sorted(checker.INSTALL_FILES))

    def test_traversal_and_non_posix_paths_rejected(self):
        for name in ['../escaped', '/absolute', 'folder/../../escaped', 'folder\\escaped',
                     'folder/./entry', 'folder//entry', 'C:/escaped']:
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, 'Unsafe archive path'):
                    checker.verify_bundle(self.bundle(extra={name:b'bad'}))

    def test_symlink_rejected(self):
        path = self.bundle()
        link = ZipInfo('unsafe-link')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with ZipFile(path, 'a') as archive:
            archive.writestr(link, '../outside')
        with self.assertRaisesRegex(ValueError, 'Non-regular'):
            checker.verify_bundle(path)

    def test_duplicate_archive_member_rejected(self):
        path = self.bundle()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with ZipFile(path, 'a') as archive:
                archive.writestr('metadata.json', '{}')
        with self.assertRaisesRegex(ValueError, 'Duplicate archive member'):
            checker.verify_bundle(path)

    def test_tamper_rejected_before_extraction(self):
        path = self.bundle(mutate=lambda files:files.update({'extension.js':b'tampered'}))
        destination = self.directory/'not-created'
        with self.assertRaisesRegex(ValueError, 'integrity check failed'):
            checker.verify_bundle(path, destination)
        self.assertFalse(destination.exists())

    def test_unlisted_file_rejected(self):
        path = self.bundle(mutate=lambda files:files.update({'unlisted.js':b'extra'}))
        with self.assertRaisesRegex(ValueError, 'every file exactly once'):
            checker.verify_bundle(path)

    def test_missing_file_rejected(self):
        path = self.bundle(mutate=lambda files:files.pop('assets/titans.png'))
        with self.assertRaisesRegex(ValueError, 'required files'):
            checker.verify_bundle(path)

    def test_wrong_uuid_version_shell_or_schema_rejected(self):
        for change in [{'uuid':'other@extension'}, {'version':True}, {'version':0},
                       {'shell-version':['49']}, {'settings-schema':'org.other'}]:
            with self.subTest(change=change):
                with self.assertRaisesRegex(ValueError, 'Metadata is not'):
                    checker.verify_bundle(self.bundle(metadata_change=change))

    def test_catalogue_and_version_mismatch_rejected(self):
        for change in [{'version':16}, {'version':True}, {'scenes':['nightfall']}]:
            with self.subTest(change=change):
                path = self.bundle(manifest_change=lambda manifest:manifest.update(change))
                with self.assertRaisesRegex(ValueError, 'version or scene catalogue'):
                    checker.verify_bundle(path)

    def test_existing_extraction_directory_rejected(self):
        destination = self.directory/'existing'
        destination.mkdir()
        with self.assertRaises(FileExistsError):
            checker.verify_bundle(self.bundle(), destination)

    def test_file_directory_collision_rejected(self):
        with self.assertRaisesRegex(ValueError, 'collision'):
            checker.verify_bundle(self.bundle(extra={'collision':b'a', 'collision/child':b'b'}))

    def test_duplicate_json_key_rejected(self):
        path = self.bundle(mutate=lambda files:files.update({'metadata.json':b'{"uuid":"x","uuid":"y"}'}))
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON key'):
            checker.verify_bundle(path)

    def mock_installer(self, bundle):
        # All GNOME commands and the settings activation Python invocation are
        # replaced. Only ZIP verification runs real Python; no host settings or
        # extension installation can be touched by these integration checks.
        folder = self.directory/'release'
        (folder/'scripts').mkdir(parents=True)
        shutil.copyfile(ROOT/'install.sh', folder/'install.sh')
        shutil.copyfile(ROOT/'scripts/verify-bundle.py', folder/'scripts/verify-bundle.py')
        commands = self.directory/'commands'
        commands.mkdir()
        scripts = {
            'gnome-shell': '#!/bin/sh\nprintf "GNOME Shell 50.0\\n"\n',
            'gnome-extensions': '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NIGHTFALL_TEST_LOG"\n[ "$1" != info ]\n',
            'python3': f'#!{sys.executable}\nimport os,sys\n'
                       'if sys.argv[1] == "-c": sys.exit(0)\n'
                       'if sys.argv[1] == "-": print("queued"); sys.exit(0)\n'
                       f'os.execv({sys.executable!r}, [{sys.executable!r}] + sys.argv[1:])\n',
            'gjs': '#!/bin/sh\necho "Unexpected build tool: gjs" >&2\nexit 99\n',
            'glib-compile-schemas': '#!/bin/sh\necho "Unexpected schema compilation" >&2\nexit 99\n',
            'update-desktop-database': '#!/bin/sh\nexit 0\n',
            'gtk-update-icon-cache': '#!/bin/sh\nexit 0\n',
        }
        for name, text in scripts.items():
            path = commands/name
            path.write_text(text)
            path.chmod(0o755)
        log = self.directory/'gnome.log'
        environment = {**os.environ, 'PATH':str(commands)+os.pathsep+os.environ['PATH'],
                       'XDG_DATA_HOME':str(self.directory/'data'), 'NIGHTFALL_TEST_LOG':str(log)}
        result = subprocess.run(['bash', str(folder/'install.sh'), '--bundle', str(bundle)],
                                env=environment, text=True, capture_output=True)
        return result, log

    @unittest.skipIf(os.geteuid() == 0, 'Installer intentionally refuses root')
    def test_installer_bundle_without_sources_or_build_tools(self):
        result, log = self.mock_installer(self.bundle())
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        commands = log.read_text().splitlines()
        self.assertEqual(len([line for line in commands if line.startswith('install --force ')]), 1)
        self.assertIn('enable nightfall@local', commands)
        self.assertEqual((self.directory/'data/applications/nightfall-wallpaper.desktop').read_bytes(), b'fixture data')
        self.assertEqual((self.directory/'data/icons/hicolor/scalable/apps/nightfall-wallpaper.svg').read_bytes(), b'fixture data')

    @unittest.skipIf(os.geteuid() == 0, 'Installer intentionally refuses root')
    def test_installer_rejects_corruption_before_touching_extension(self):
        bundle = self.bundle(mutate=lambda files:files.update({'extension.js':b'tampered'}))
        result, log = self.mock_installer(bundle)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('integrity check failed', result.stderr)
        self.assertFalse(log.exists(), 'No GNOME extension command may run before validation')
        self.assertFalse((self.directory/'data').exists())


if __name__ == '__main__':
    unittest.main()
