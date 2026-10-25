#!/usr/bin/env python3
"""Build reproducible, data-only scene archives and the public JSON catalogue.

Python's standard library and GJS are sufficient. Preview PNGs are reviewed,
committed source files; no image encoder or network access is needed at build
time. ZIP_STORED avoids compressor-version differences between build hosts.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
from functools import lru_cache
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
from urllib.parse import urlsplit
from zipfile import ZipFile, ZipInfo, ZIP_STORED

ROOT = Path(__file__).resolve().parents[1]
CATALOG_BASE = 'https://tanosxx.github.io/nightfall-wallpaper/catalog/'
CORE_VERSION = json.loads((ROOT / 'extension/nightfall@local/metadata.json').read_text())['version']
RELEASE_BASE = f'https://github.com/tanosxx/nightfall-wallpaper/releases/download/v{CORE_VERSION}/'
RENDERERS = {'nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans'}
ID_PATTERN = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
NOTICES = ('LICENSE', 'NOTICE.md', 'ASSETS.md')
METADATA_FIELDS = ('id', 'name', 'subtitle', 'description', 'image', 'width', 'height', 'control', 'weatherLabel')


@lru_cache(maxsize=1)
def desktop_contract():
    spec = importlib.util.spec_from_file_location('nightfall_pack_contract', ROOT / 'extension/nightfall@local/scene-manager.py')
    contract = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(contract)
    return contract


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')


def digest(data: bytes) -> dict:
    return {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def safe_path(value: str) -> Path:
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError(f'Invalid source path: {value!r}')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or path.as_posix() != value:
        raise ValueError(f'Invalid source path: {value!r}')
    return Path(*path.parts)


def source_file(root: Path, path: Path) -> Path:
    full = root / path
    if full.is_symlink() or any(parent.is_symlink() for parent in full.parents if parent != root.parent):
        raise ValueError(f'Symbolic links are not scene content: {path}')
    if not full.is_file() or not full.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Missing or unsafe source file: {path}')
    return full


def scene_metadata(root: Path = ROOT) -> list[dict]:
    return json.loads(subprocess.check_output(['gjs', '-m', str(root / 'catalog-export.js')], text=True))


def load_sources(root: Path = ROOT) -> list[tuple[dict, dict]]:
    config = json.loads((root / 'catalog/scenes.json').read_text(encoding='utf-8'))
    if config.get('formatVersion') != 1 or not isinstance(config.get('scenes'), dict):
        raise ValueError('Unsupported source catalogue')
    scenes = scene_metadata(root)
    if not {s['id'] for s in scenes}.issubset(config['scenes']):
        raise ValueError('The source catalogue must describe every built-in preview scene')
    builtins = {s['id'] for s in scenes}
    for sid, source in config['scenes'].items():
        if sid not in builtins:
            metadata = source.get('metadata')
            if not isinstance(metadata, dict) or metadata.get('id') != sid:
                raise ValueError(f'Additional scene {sid} needs its own metadata with matching id')
            scenes.append(metadata)
    return [(scene, config['scenes'][scene['id']]) for scene in scenes]


def collect_files(root: Path, scene: dict, source: dict) -> dict[str, bytes]:
    selected: set[Path] = set()
    for value in source['assets']:
        path = safe_path(value)
        if path.parts[0] != 'assets':
            raise ValueError(f'Scene data must be below assets/: {value}')
        full = root / path
        if full.is_symlink():
            raise ValueError(f'Symbolic links are not scene content: {path}')
        if full.is_dir():
            for file in full.rglob('*'):
                if file.is_symlink():
                    raise ValueError(f'Symbolic links are not scene content: {file}')
                if file.is_file():
                    selected.add(file.relative_to(root))
        else:
            selected.add(path)
    excluded = {safe_path(value) for value in source.get('exclude', [])}
    if not excluded.issubset(selected):
        raise ValueError('An excluded file is not part of the selected scene')
    selected -= excluded
    if safe_path(scene['image']) not in selected:
        raise ValueError(f"Scene is missing its background: {scene['id']}")
    files = {}
    for path in sorted(selected):
        if path.suffix.lower() not in {'.png', '.json'}:
            raise ValueError(f'Executable or unsupported scene content: {path}')
        data = source_file(root, path).read_bytes()
        if path.suffix.lower() == '.png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Invalid PNG signature: {path}')
        if path.suffix.lower() == '.json':
            json.loads(data)
        files[path.as_posix()] = data
    for notice in NOTICES:
        files[notice] = source_file(root, Path(notice)).read_bytes()
    return files


def make_manifest(scene: dict, source: dict, files: dict[str, bytes]) -> dict:
    sid = scene['id']
    renderer = scene.get('renderer', sid)
    if not ID_PATTERN.fullmatch(sid) or renderer not in RENDERERS:
        raise ValueError(f'Unsupported scene identifier or renderer: {sid}')
    if type(source['version']) is not int or source['version'] < 1:
        raise ValueError('Scene version must be a positive integer')
    for field in ('author', 'license'):
        if not isinstance(source[field], str) or not source[field].strip():
            raise ValueError(f'Empty scene {field}')
    metadata = {field: scene[field] for field in METADATA_FIELDS}
    if (metadata['width'], metadata['height']) != (1672, 941):
        raise ValueError('Unsupported scene dimensions')
    if metadata['control'] not in {'weather', 'flow', 'activity'}:
        raise ValueError('Unsupported intensity control')
    manifest = {'formatVersion': 1, **metadata, 'renderer': renderer, 'version': source['version'],
            'author': source['author'], 'license': source['license'],
            'files': {path: digest(data) for path, data in sorted(files.items())}}
    # The publisher and desktop installer share the exact format and required
    # native texture list, so a renderer cannot silently lose an asset.
    desktop_contract().validate_manifest(manifest)
    return manifest


def write_archive(path: Path, manifest: dict, files: dict[str, bytes]) -> None:
    contents = {**files, 'scene.json': encoded(manifest)}
    with ZipFile(path, 'w', compression=ZIP_STORED, allowZip64=False) as archive:
        for name, data in sorted(contents.items()):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = ZIP_STORED
            archive.writestr(info, data)


def checked_base(value: str) -> str:
    url = urlsplit(value)
    if url.scheme != 'https' or not url.netloc or url.query or url.fragment or not value.endswith('/'):
        raise ValueError('Catalogue and release bases must be absolute HTTPS directory URLs')
    return value


def build(output: Path = ROOT / 'dist', *, root: Path = ROOT,
          catalog_base: str = CATALOG_BASE, release_base: str = RELEASE_BASE) -> dict:
    catalog_base, release_base = checked_base(catalog_base), checked_base(release_base)
    output = output.resolve()
    dist = (root / 'dist').resolve()
    if not output.is_relative_to(dist):
        raise ValueError('Build output must be inside this repository’s dist/')
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with tempfile.TemporaryDirectory(prefix='.scene-stage-', dir=output) as directory:
        stage = Path(directory)
        packs, catalog = stage / 'scenes', stage / 'catalog'
        packs.mkdir(); (catalog / 'previews').mkdir(parents=True)
        for scene, source in load_sources(root):
            files = collect_files(root, scene, source)
            manifest = make_manifest(scene, source, files)
            name = f"nightfall-scene-{scene['id']}-v{manifest['version']}.zip"
            write_archive(packs / name, manifest, files)
            preview_path = safe_path(source['preview'])
            if preview_path.parts[:2] != ('catalog', 'previews') or preview_path.suffix != '.png':
                raise ValueError('Preview must be a reviewed catalog/previews/*.png source file')
            preview = source_file(root, preview_path).read_bytes()
            if not preview.startswith(b'\x89PNG\r\n\x1a\n') or len(preview) > 1_000_000:
                raise ValueError('Preview must be a PNG smaller than 1 MB')
            preview_name = f"{scene['id']}.png"
            (catalog / 'previews' / preview_name).write_bytes(preview)
            records.append({key: value for key, value in manifest.items() if key != 'files'} | {
                'previewUrl': catalog_base + 'previews/' + preview_name,
                'previewSha256': digest(preview)['sha256'], 'previewBytes': len(preview),
                'package': {'url': release_base + name, **digest((packs / name).read_bytes())}})
        index = {'formatVersion': 1, 'engineVersion': 1, 'scenes': records}
        desktop_contract().validate_catalog(index)
        (catalog / 'index.json').write_bytes(encoded(index))
        for name in ('scenes', 'catalog'):
            target = output / name
            if target.exists():
                if target.is_symlink():
                    raise ValueError(f'Unsafe build destination: {target}')
                shutil.rmtree(target)
            shutil.move(str(stage / name), target)
    return {'catalog': str(output / 'catalog/index.json'), 'archives': len(records),
            'bytes': sum(record['package']['bytes'] for record in records),
            'previewsBytes': sum(record['previewBytes'] for record in records)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--catalog-base', default=CATALOG_BASE)
    parser.add_argument('--release-base', default=RELEASE_BASE)
    args = parser.parse_args()
    print(json.dumps(build(args.output, catalog_base=args.catalog_base, release_base=args.release_base), indent=2))
