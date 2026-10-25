// The public gallery displays reviewed metadata as text, never as HTML.
const RELEASE = /^https:\/\/github\.com\/tanosxx\/nightfall-wallpaper\/releases\/download\/v[1-9][0-9]*\/nightfall-scene-([a-z][a-z0-9-]{0,63})-v([1-9][0-9]*)\.zip$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const RENDERERS = ['nightfall', 'polar', 'station', 'abyss', 'junction', 'cloudcity', 'titans'];
export function readDownloadCatalog(value, knownIds) {
  if (value?.formatVersion !== 1 || value.engineVersion !== 1 || !Array.isArray(value.scenes))
    throw new Error('Unsupported scene catalogue');
  const records = new Map();
  for (const scene of value.scenes) {
    if (!scene || !ID.test(scene.id) || !RENDERERS.includes(scene.renderer) || records.has(scene.id))
      throw new Error('Unknown or duplicate scene');
    const match = typeof scene.package?.url === 'string' && RELEASE.exec(scene.package.url);
    if (!match || match[1] !== scene.id || Number(match[2]) !== scene.version ||
        !Number.isSafeInteger(scene.version) || scene.version < 1 ||
        !Number.isSafeInteger(scene.package.bytes) || scene.package.bytes < 1 || scene.package.bytes > 160 * 1024 * 1024 ||
        !HASH.test(scene.package.sha256)) throw new Error('Invalid scene package');
    for (const [key, limit] of Object.entries({name: 120, subtitle: 300, description: 2400, author: 160, license: 120}))
      if (typeof scene[key] !== 'string' || !scene[key].trim() || scene[key].length > limit)
        throw new Error('Invalid scene attribution');
    if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(scene.image) ||
        scene.previewUrl !== `https://tanosxx.github.io/nightfall-wallpaper/catalog/previews/${scene.id}.png`)
      throw new Error('Invalid scene image');
    records.set(scene.id, scene);
  }
  if (!knownIds.every(id => records.has(id))) throw new Error('Incomplete scene catalogue');
  return records;
}

export function formatPackageSize(bytes) {
  return `${(bytes / 1024 / 1024).toLocaleString('ru-RU', {maximumFractionDigits: 1})} МБ`;
}

export function createSceneCard(scene, doc = document) {
  const group = doc.createElement('article'); group.className = 'pack-card';
  const card = doc.createElement('button'); card.className = 'scene-card'; card.dataset.scene = scene.id;
  card.setAttribute('aria-label', `Предпросмотр сцены «${scene.title}»`);
  const image = doc.createElement('img');
  image.dataset.src = `catalog/previews/${scene.id}.png`;
  image.loading = 'lazy'; image.decoding = 'async'; image.width = 480; image.height = 270; image.alt = '';
  const text = doc.createElement('span'); text.className = 'card-text';
  const labels = doc.createElement('span');
  const title = doc.createElement('span'); title.className = 'card-title'; title.textContent = scene.title;
  const subtitle = doc.createElement('span'); subtitle.className = 'card-subtitle'; subtitle.textContent = scene.detail;
  const check = doc.createElement('span'); check.className = 'card-check'; check.setAttribute('aria-hidden', 'true');
  labels.append(title, subtitle); text.append(labels, check); card.append(image, text);
  const details = doc.createElement('div'); details.className = 'pack-details'; details.hidden = true;
  group.append(card, details);
  return {group, card, details};
}
