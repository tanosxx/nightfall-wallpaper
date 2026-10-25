import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readDownloadCatalog, formatPackageSize, createSceneCard} from '../catalog-view.js';

const catalog = JSON.parse(await readFile(new URL('../dist/catalog/index.json', import.meta.url), 'utf8'));
const ids = catalog.scenes.map(scene => scene.id);

test('published catalogue supplies one independent download for all seven scenes', () => {
  const parsed = readDownloadCatalog(catalog, ids);
  assert.equal(parsed.size, 7);
  assert.equal(parsed.get('nightfall').renderer, 'nightfall');
  assert.match(formatPackageSize(parsed.get('titans').package.bytes), /МБ$/);
});

test('unsafe external and script URLs never become gallery download links', () => {
  for (const url of ['javascript:alert(1)', 'https://evil.example/scene.zip', 'https://github.com.evil.example/tanosxx/nightfall-wallpaper/releases/download/v16/nightfall-scene-nightfall-v1.zip', 'https://github.com/tanosxx/other/releases/download/v16/nightfall-scene-nightfall-v1.zip']) {
    const value = structuredClone(catalog);
    value.scenes[0].package.url = url;
    assert.throws(() => readDownloadCatalog(value, ids));
  }
});

test('duplicate or missing scenes and mismatched archive versions are rejected', () => {
  const duplicate = structuredClone(catalog);
  duplicate.scenes.push(duplicate.scenes[0]);
  assert.throws(() => readDownloadCatalog(duplicate, ids));
  const incomplete = structuredClone(catalog);
  incomplete.scenes.pop();
  assert.throws(() => readDownloadCatalog(incomplete, ids));
  const mismatch = structuredClone(catalog);
  mismatch.scenes[0].version += 1;
  assert.throws(() => readDownloadCatalog(mismatch, ids));
});

test('reviewed community IDs can reuse a known renderer without supplying executable preview code', () => {
  const value = structuredClone(catalog);
  const extra = structuredClone(value.scenes.find(scene => scene.id === 'polar'));
  extra.id = 'community-polar';
  extra.image = 'assets/community-polar.png';
  extra.previewUrl = 'https://tanosxx.github.io/nightfall-wallpaper/catalog/previews/community-polar.png';
  extra.package.url = 'https://github.com/tanosxx/nightfall-wallpaper/releases/download/v16/nightfall-scene-community-polar-v1.zip';
  value.scenes.push(extra);
  assert.equal(readDownloadCatalog(value, ids).get(extra.id).renderer, 'polar');
  extra.renderer = 'downloaded-script';
  assert.throws(() => readDownloadCatalog(value, ids));
});

test('community titles and subtitles remain literal text, never parsed markup', () => {
  // A tiny document double records DOM operations. Any HTML parsing setter is
  // an immediate regression, even if a harmless title would appear correct.
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; }
    set innerHTML(_value) { throw new Error('Remote content must not enter an HTML parser'); }
    set outerHTML(_value) { throw new Error('Remote content must not enter an HTML parser'); }
    insertAdjacentHTML() { throw new Error('Remote content must not enter an HTML parser'); }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...items) { this.children.push(...items); }
  }
  const malicious = '<img src=x onerror="globalThis.executed=true"><script>alert(1)</script>';
  const {group, card} = createSceneCard({id:'community-polar', title:malicious, detail:malicious}, {createElement:tag => new Element(tag)});
  const all = element => [element, ...element.children.flatMap(all)];
  const nodes = all(group);
  assert.equal(nodes.filter(node => node.tagName === 'img').length, 1);
  assert.equal(nodes.filter(node => node.tagName === 'script').length, 0);
  assert.equal(nodes.find(node => node.className === 'card-title').textContent, malicious);
  assert.equal(nodes.find(node => node.className === 'card-subtitle').textContent, malicious);
  assert.equal(card.attributes['aria-label'], `Предпросмотр сцены «${malicious}»`);
});
