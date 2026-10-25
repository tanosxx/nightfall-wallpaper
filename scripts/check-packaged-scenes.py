#!/usr/bin/env python3
"""Install release scene ZIPs into a disposable library and exercise real Cairo renderers."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('--packs', type=Path, default=ROOT/'dist/scenes')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='nightfall-packaged-scenes-') as temporary:
    env = {**os.environ, 'XDG_DATA_HOME': str(Path(temporary)/'data'),
           'XDG_CACHE_HOME': str(Path(temporary)/'cache')}
    manager = args.stage.resolve()/'scene-manager.py'
    packs = sorted(args.packs.glob('*.zip'))
    if len(packs) < 7:
        raise SystemExit('Build the seven scene packs first')
    subprocess.run(['gjs', '-m', str(ROOT/'tests/installed-scenes.test.js'),
                    str(args.stage.resolve())], env=env, check=True)
    for pack in packs:
        if pack.name.startswith('nightfall-scene-nightfall-'):
            continue  # The offline city cannot be replaced by a downloaded pack.
        result = json.loads(subprocess.check_output(
            ['python3', str(manager), 'install-file', str(pack.resolve())], env=env, text=True))
        if not result.get('ok'):
            raise SystemExit(f'Package installation failed: {pack.name}')
        print(f'Installed {result["scene"]["id"]} v{result["scene"]["version"]} into the test library', flush=True)
    subprocess.run(['gjs', '-m', str(ROOT/'tests/desktop-bundle.test.js'),
                    str(args.stage.resolve())], env=env, check=True)
