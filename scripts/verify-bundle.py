#!/usr/bin/env python3
"""Check a Nightfall ZIP before installation; optionally extract fixed installer files.

The manifest checks completeness and integrity, not the publisher's identity.
No archive member name is ever used as an extraction destination.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from zipfile import ZipFile, BadZipFile, ZIP_STORED, ZIP_DEFLATED

UUID = 'nightfall@local'
SCENES = ['nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans']
INSTALL_FILES = ('metadata.json', 'app/nightfall-wallpaper.desktop', 'app/nightfall-wallpaper.svg')
REQUIRED = set(INSTALL_FILES) | {
    'extension.js', 'prefs.js', 'scene-catalog.js', 'scene-registry.js',
    'schemas/org.gnome.shell.extensions.nightfall.gschema.xml', 'schemas/gschemas.compiled',
    'native-renderer.js', 'polar-renderer.js', 'station-renderer.js', 'abyss-renderer.js',
    'junction-renderer.js', 'cloudcity-renderer.js', 'titans-renderer.js',
    'assets/city.png',
}
PACK_MANAGER_FILES = {'installed-scenes.js', 'scene-manager.py', 'scene-manager-client.js'}


def safe_name(name):
    if (not isinstance(name, str) or not name or '\\' in name or ':' in name or '//' in name
            or any(ord(char) < 32 for char in name) or name.startswith('/')
            or any(part in ('', '.', '..') for part in name.rstrip('/').split('/'))
            or PurePosixPath(name).is_absolute()):
        raise ValueError(f'Unsafe archive path: {name!r}')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def verify_bundle(path, extract_install_files=None):
    with ZipFile(path) as archive:
        entries = archive.infolist()
        if not entries or len(entries) > 4096:
            raise ValueError('Unexpected archive entry count')
        names, files, total = set(), set(), 0
        for entry in entries:
            safe_name(entry.filename)
            if entry.filename in names:
                raise ValueError(f'Duplicate archive member: {entry.filename}')
            names.add(entry.filename)
            mode = entry.external_attr >> 16
            kind = stat.S_IFMT(mode)
            allowed_kind = stat.S_IFDIR if entry.is_dir() else stat.S_IFREG
            if kind not in (0, allowed_kind):
                raise ValueError(f'Non-regular archive member: {entry.filename}')
            if entry.flag_bits & 1 or entry.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
                raise ValueError(f'Unsupported ZIP encoding: {entry.filename}')
            if entry.file_size > 128 * 1024**2:
                raise ValueError(f'Archive member is too large: {entry.filename}')
            total += entry.file_size
            if not entry.is_dir():
                files.add(entry.filename)
        if total > 1024**3:
            raise ValueError('Archive expands beyond 1 GiB')
        for name in files:
            if any(str(parent) in files for parent in PurePosixPath(name).parents):
                raise ValueError(f'Archive file/directory collision: {name}')
        if not (REQUIRED | {'bundle-manifest.json'}) <= files:
            raise ValueError('Incomplete Nightfall bundle: required files are missing')
        if archive.getinfo('metadata.json').file_size > 65536 or archive.getinfo('bundle-manifest.json').file_size > 2 * 1024**2:
            raise ValueError('Metadata or manifest is too large')
        metadata = json.loads(archive.read('metadata.json'), object_pairs_hook=unique_object)
        manifest = json.loads(archive.read('bundle-manifest.json'), object_pairs_hook=unique_object)
        if not isinstance(metadata, dict) or not isinstance(manifest, dict):
            raise ValueError('Metadata and manifest must be JSON objects')
        version = metadata.get('version')
        if (metadata.get('uuid') != UUID or type(version) is not int or version < 1
                or metadata.get('settings-schema') != 'org.gnome.shell.extensions.nightfall'
                or not isinstance(metadata.get('shell-version'), list)
                or '50' not in metadata['shell-version']):
            raise ValueError('Metadata is not a GNOME 50 Nightfall release')
        if type(manifest.get('version')) is not int or manifest.get('version') != version or manifest.get('scenes') != SCENES:
            raise ValueError('Manifest version or scene catalogue disagrees with Nightfall')
        install_files = INSTALL_FILES
        if version >= 16:
            if not PACK_MANAGER_FILES <= files or manifest.get('bundledScenes') != ['nightfall']:
                raise ValueError('Incomplete catalogue-enabled Nightfall bundle')
            install_files = INSTALL_FILES + ('scene-manager.py',)
        elif not {f'assets/{name}.png' for name in SCENES[1:]} <= files:
            raise ValueError('Legacy bundle is missing scene photographs')
        hashes = manifest.get('files')
        if not isinstance(hashes, dict) or set(hashes) != files - {'bundle-manifest.json'}:
            raise ValueError('Manifest must list every file exactly once')
        for name, expected in hashes.items():
            safe_name(name)
            if not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected):
                raise ValueError(f'Invalid SHA-256 value: {name}')
            digest = hashlib.sha256()
            with archive.open(name) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise ValueError(f'File integrity check failed: {name}')
        # Validate everything before creating any output. Destinations are a
        # constant allowlist in a new directory, never arbitrary ZIP paths.
        if extract_install_files is not None:
            destination = Path(extract_install_files)
            destination.mkdir(mode=0o700, parents=False, exist_ok=False)
            (destination / 'app').mkdir(mode=0o700)
            for name in install_files:
                with (destination / name).open('xb') as output:
                    output.write(archive.read(name))
        return {'uuid': UUID, 'version': version, 'scenes': SCENES, 'files': len(files), 'uncompressedBytes': total}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--extract-install-files', type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_bundle(args.bundle, args.extract_install_files)))
    except (OSError, ValueError, BadZipFile, RuntimeError) as error:
        parser.exit(1, f'Invalid Nightfall bundle: {error}\n')


if __name__ == '__main__':
    main()
