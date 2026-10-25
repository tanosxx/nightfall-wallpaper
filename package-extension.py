#!/usr/bin/env python3
"""Build the desktop package from the same catalogue/assets as the preview."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'extension' / 'nightfall@local'


def build(stage, archive):
    catalogue = json.loads(subprocess.check_output(
        ['gjs', '-m', str(ROOT / 'catalog-export.js')], text=True))
    if stage.exists():
        raise ValueError(f'Staging destination already exists: {stage}')
    for folder in [SOURCE, ROOT / 'assets', ROOT / 'app']:
        if folder.is_symlink() or any(p.is_symlink() for p in folder.rglob('*')):
            raise ValueError(f'Symlinks are not supported in package sources: {folder}')
    renderers = {'nightfall': 'native-renderer.js', 'polar': 'polar-renderer.js',
                 'station': 'station-renderer.js', 'abyss': 'abyss-renderer.js',
                 'junction': 'junction-renderer.js', 'cloudcity': 'cloudcity-renderer.js',
                 'titans': 'titans-renderer.js'}
    for scene in catalogue:
        if scene['id'] not in renderers:
            raise ValueError(f"Desktop renderer missing for scene: {scene['id']}")
        for required in [ROOT / scene['image'], SOURCE / renderers[scene['id']]]:
            if not required.is_file():
                raise FileNotFoundError(required)
    for folder in ['abyss-native', 'junction-native', 'cloudcity-native', 'station-relief', 'station-native', 'titans']:
        if not (ROOT / 'assets' / folder).is_dir():
            raise FileNotFoundError(f'Missing native scene assets: {folder}')
    shutil.copytree(SOURCE, stage, ignore=shutil.ignore_patterns(
        'assets', 'app', '__pycache__', '*.pyc', '*.bak', '*.tmp', 'bundle-manifest.json'))
    shutil.copytree(ROOT / 'assets', stage / 'assets')
    shutil.copytree(ROOT / 'app', stage / 'app')
    for notice in ['LICENSE', 'NOTICE.md', 'ASSETS.md']:
        shutil.copy2(ROOT / notice, stage / notice)
    subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
    hashes = {p.relative_to(stage).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(stage.rglob('*')) if p.is_file()}
    version = json.loads((stage / 'metadata.json').read_text())['version']
    manifest = {'version': version, 'scenes': [s['id'] for s in catalogue], 'files': hashes}
    (stage / 'bundle-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    archive.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as output:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                output.write(path, path.relative_to(stage).as_posix())
    print(json.dumps({'archive': str(archive), 'stage': str(stage),
                      'version': version, 'scenes': manifest['scenes'], 'files': len(hashes)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True, type=Path)
    parser.add_argument('--archive', required=True, type=Path)
    args = parser.parse_args()
    build(args.stage, args.archive)
