#!/usr/bin/env python3
"""Wrap a verified extension ZIP with the normal-user installer and license."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    checked = json.loads(subprocess.check_output(
        [sys.executable, str(ROOT/'scripts/verify-bundle.py'), str(args.bundle)], text=True))
    required = ['install.sh', 'uninstall.sh', 'LICENSE', 'NOTICE.md', 'ASSETS.md',
                'README.md', 'scripts/verify-bundle.py']
    for name in required:
        source = ROOT/name
        if not source.is_file() or source.is_symlink():
            parser.error(f'Missing regular release file: {name}')
    args.output.mkdir(parents=True, exist_ok=True)
    bundle = args.output/'nightfall@local.shell-extension.zip'
    if args.bundle.resolve() != bundle.resolve():
        shutil.copyfile(args.bundle, bundle)
    folder_name = f'nightfall-v{checked["version"]}'
    archive = args.output/f'{folder_name}-linux.tar.gz'
    with tempfile.TemporaryDirectory(prefix='nightfall-release-') as temporary:
        folder = Path(temporary)/folder_name
        folder.mkdir()
        for name in required:
            target = folder/name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT/name, target)
            target.chmod(0o755 if name.endswith('.sh') else 0o644)
        shutil.copyfile(bundle, folder/bundle.name)
        (folder/'SOURCE.txt').write_text(
            f'Nightfall v{checked["version"]}\n'
            f'Source: https://github.com/tanosxx/nightfall-wallpaper/tree/v{checked["version"]}\n'
            'License: GPL-3.0-only (see LICENSE).\n', encoding='utf-8')
        with tarfile.open(archive, 'w:gz') as target:
            target.add(folder, arcname=folder_name)
    scene_packs = sorted((args.output/'scenes').glob('*.zip'))
    sums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n'
                   for path in (bundle, archive, *scene_packs))
    (args.output/'SHA256SUMS').write_text(sums, encoding='ascii')
    print(json.dumps({'version':checked['version'], 'bundle':str(bundle),
                      'installerArchive':str(archive), 'checksums':str(args.output/'SHA256SUMS')}))


if __name__ == '__main__':
    main()
