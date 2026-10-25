#!/usr/bin/env python3
"""Build the self-contained browser preview, without copying the repository.

Run from any directory: python3 scripts/build-pages.py
The default output is dist/site. Only the eight public HTML entry points,
their transitive browser scripts/styles, and the asset tree are published.
No bundler, network service, Node dependencies, or CDN is required.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CATALOG = Path('extension/nightfall@local/scene-catalog.js')
CODE_SUFFIXES = {'.html', '.js', '.css'}
ASSET_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.json', '.woff', '.woff2'}
NOTICES = {Path('LICENSE'), Path('NOTICE.md'), Path('ASSETS.md'), Path('vendor/three/LICENSE')}
IMPORTS = re.compile(r'''\b(?:import\s*(?:[\w*\s{},]+\s+from\s*)?|export\s+[\w*\s{},]+\s+from\s*|import\s*\(\s*)["']([^"']+)["']''')
CSS_URLS = re.compile(r'''url\(\s*["']?([^\s)'";]+)["']?\s*\)''')
ROOT_ASSETS = re.compile(r'''["'](assets/[^"'\n]+\.(?:png|jpe?g|webp|svg|gif|json)(?:\?[^"']*)?)["']''')


class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources: list[str] = []
        self.navigation: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.navigation.append(attrs['href'])
        for key in ('src', 'poster'):
            if attrs.get(key):
                self.resources.append(attrs[key])
        if tag == 'link' and attrs.get('href'):
            self.resources.append(attrs['href'])


def local_path(source: Path, reference: str, *, navigation: bool = False) -> Path | None:
    """Resolve a browser URL while preserving GitHub project-page subpaths."""
    reference = reference.strip()
    if not reference or reference.startswith('#'):
        return None
    parts = urlsplit(reference)
    if parts.scheme == 'data':
        return None
    if parts.scheme or parts.netloc:
        if navigation and parts.scheme in {'http', 'https', 'mailto'}:
            return None
        raise ValueError(f'{source}: external runtime dependency {reference!r}')
    path = unquote(parts.path)
    if not path:
        return None
    if path.startswith('/') or '\\' in path:
        raise ValueError(f'{source}: non-portable absolute URL {reference!r}')
    normalized: list[str] = []
    for part in (source.parent / path).parts:
        if part in ('', '.'):
            continue
        if part == '..':
            if not normalized:
                raise ValueError(f'{source}: URL escapes the site: {reference!r}')
            normalized.pop()
        else:
            normalized.append(part)
    return Path(*normalized)


def dependencies(root: Path, source: Path) -> set[Path]:
    text = (root / source).read_text(encoding='utf-8')
    references: list[tuple[str, bool]] = []
    if source.suffix == '.html':
        parser = PageLinks()
        parser.feed(text)
        references += [(url, False) for url in parser.resources]
        references += [(url, True) for url in parser.navigation]
    if source.suffix == '.js':
        references += [(url, False) for url in IMPORTS.findall(text)]
    if source.suffix in {'.html', '.css'}:
        references += [(url, False) for url in CSS_URLS.findall(text)]
    result = {path for reference, navigation in references
              if (path := local_path(source, reference, navigation=navigation)) is not None}
    # These URLs are relative to the document, even when assigned by a module.
    if source.suffix == '.js':
        result.update(local_path(Path('index.html'), url) for url in ROOT_ASSETS.findall(text))
    return result


def entrypoints(root: Path = ROOT) -> list[Path]:
    catalog = (root / CATALOG).read_text(encoding='utf-8')
    pages = re.findall(r'''\bpage:\s*["']([^"']+)["']''', catalog)
    if len(pages) != 7:
        raise ValueError(f'Expected seven catalogue scenes, found {len(pages)}')
    entries = [Path('index.html'), *(local_path(Path('index.html'), page) for page in pages)]
    if len(set(entries)) != 8:
        raise ValueError('Catalogue pages must be unique')
    return entries


def allowed_source(path: Path) -> bool:
    if path in NOTICES:
        return True
    if any(part.startswith('.') for part in path.parts):
        return False
    if path.parts[0] == 'assets':
        return path.suffix.lower() in ASSET_SUFFIXES
    if path.parts[0] == 'catalog':
        return path == Path('catalog/index.json') or (len(path.parts) == 3 and path.parts[1] == 'previews' and path.suffix == '.png')
    if len(path.parts) == 1:
        return path.suffix in CODE_SUFFIXES
    if path.parts[:2] == ('extension', 'nightfall@local'):
        return len(path.parts) == 3 and path.suffix == '.js'
    if path.parts[0] == 'vendor':
        return path.suffix in {'.js', '.css'}
    return False


def collect(root: Path = ROOT) -> set[Path]:
    pending = [*entrypoints(root), CATALOG, *NOTICES]
    selected: set[Path] = set()
    while pending:
        path = pending.pop()
        if path in selected:
            continue
        file = root / path
        if not allowed_source(path):
            raise ValueError(f'Runtime dependency is outside the public allowlist: {path}')
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root.resolve()):
            raise ValueError(f'Missing, symbolic, or unsafe runtime dependency: {path}')
        selected.add(path)
        if path.suffix in CODE_SUFFIXES:
            pending.extend(dependencies(root, path))
    # Runtime asset tables compose filenames dynamically. Copy this one known
    # public tree, not arbitrary directories inferred from string literals.
    for file in (root / 'assets').rglob('*'):
        path = file.relative_to(root)
        if file.is_symlink():
            raise ValueError(f'Symbolic links are not publishable: {path}')
        if file.is_file():
            if not allowed_source(path):
                raise ValueError(f'Unexpected file in public assets: {path}')
            selected.add(path)
    return selected


def validate_site(site: Path) -> None:
    for source in sorted(site.rglob('*')):
        if source.is_file() and source.suffix in CODE_SUFFIXES:
            relative = source.relative_to(site)
            for target in dependencies(site, relative):
                if not (site / target).is_file():
                    raise ValueError(f'{relative}: missing public dependency {target}')
    for page in entrypoints(site):
        if not (site / page).is_file():
            raise ValueError(f'Missing catalogue page: {page}')
    catalog = json.loads((site / 'catalog/index.json').read_text(encoding='utf-8'))
    if catalog.get('formatVersion') != 1 or catalog.get('engineVersion') != 1 or len(catalog.get('scenes', [])) < 7:
        raise ValueError('Missing or incompatible download catalogue')
    for scene in catalog['scenes']:
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', scene.get('id', '')):
            raise ValueError('Invalid scene identifier in public catalogue')
        if not re.fullmatch(r'assets/[A-Za-z0-9][A-Za-z0-9._-]*\.png', scene.get('image', '')) or not (site / scene['image']).is_file():
            raise ValueError(f"Missing or invalid catalogue background: {scene['id']}")
        preview = site / 'catalog/previews' / f"{scene['id']}.png"
        data = preview.read_bytes()
        if len(data) != scene['previewBytes'] or hashlib.sha256(data).hexdigest() != scene['previewSha256']:
            raise ValueError(f"Damaged catalogue preview: {scene['id']}")


def build(output: Path = ROOT / 'dist' / 'site') -> dict:
    output = output.resolve()
    dist = ROOT / 'dist'
    if not output.is_relative_to(dist.resolve()) or output == dist.resolve():
        raise ValueError('Build output must be a directory below this repository’s dist/')
    selected = collect()
    dist.mkdir(exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-scene-packs.py')], check=True, stdout=subprocess.DEVNULL)
    with tempfile.TemporaryDirectory(prefix='.pages-stage-', dir=dist) as directory:
        stage = Path(directory) / 'site'
        stage.mkdir()
        for path in sorted(selected):
            destination = stage / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, destination)
        for file in (dist / 'catalog').rglob('*'):
            if file.is_file():
                path = file.relative_to(dist)
                if not allowed_source(path):
                    raise ValueError(f'Unexpected catalogue output: {path}')
                destination = stage / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, destination)
                selected.add(path)
        (stage / '.nojekyll').write_text('', encoding='utf-8')
        manifest = {'entrypoints': [p.as_posix() for p in entrypoints()], 'files': {
            path.as_posix(): {'bytes': (stage / path).stat().st_size,
                'sha256': hashlib.sha256((stage / path).read_bytes()).hexdigest()}
            for path in sorted(selected)}}
        (stage / 'site-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        validate_site(stage)
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(stage), output)
    return {'output': str(output), 'entrypoints': len(manifest['entrypoints']),
            'files': len(selected), 'bytes': sum(file['bytes'] for file in manifest['files'].values())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / 'site')
    args = parser.parse_args()
    print(json.dumps(build(args.output), indent=2))
