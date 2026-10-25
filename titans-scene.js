import {createTitansTimeline, TITANS_WIDTH, TITANS_HEIGHT} from './extension/nightfall@local/titans-timeline.js?v=15';
import {GROUND_ASSET_FILES, createGroundEffects} from './extension/nightfall@local/titans-ground.js?v=15';
import {SKY_ASSET_FILES, createSkyEffects} from './extension/nightfall@local/titans-sky.js?v=15';
import {LEFT_SMOKE_ASSET_FILES, createLeftSmokeEffects} from './extension/nightfall@local/titans-left-smoke.js?v=15';
import {SUIT_ASSET_FILES, createSuitEffects} from './extension/nightfall@local/titans-suit.js?v=15';

const $ = id => document.getElementById(id), canvas = $('atmosphere'), ctx = canvas.getContext('2d');
const background = document.querySelector('.city');
const embedded = new URLSearchParams(location.search).has('embed');
const clock = createTitansTimeline();
let sky = null, ground = null, leftSmoke = null, suit = null, ready = false, failed = false;
let width = innerWidth, height = innerHeight, ratio = 1;
let frame, last = null, lastPaint = -Infinity, paused = false;
let hideTimer, hiddenByUser = false;

function camera() {
    // The preview must show the entire source composition, including the
    // distant right edge. Desktop uses cover to fill each monitor as usual.
    const scale = Math.min(width / TITANS_WIDTH, height / TITANS_HEIGHT);
    return {scale, x: (width - TITANS_WIDTH * scale) / 2, y: (height - TITANS_HEIGHT * scale) / 2};
}
function diagnostics() {
    return {scene: 'titans', native: false, ready, paused, time: clock.time, intensity: clock.intensity,
        camera: camera(), dimensions: [TITANS_WIDTH, TITANS_HEIGHT],
        leftSmoke: leftSmoke?.getDiagnostics?.(clock.time, clock.intensity) ?? null,
        suit: suit?.getDiagnostics?.(clock.time, clock.intensity) ?? null,
        sky: sky?.getDiagnostics?.(clock.time, clock.intensity) ?? null,
        ground: ground?.getDiagnostics?.(clock.time, clock.intensity) ?? null};
}
function draw() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    if (ready) {
        const c = camera();
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.scale, c.scale);
        ctx.beginPath(); ctx.rect(0, 0, TITANS_WIDTH, TITANS_HEIGHT); ctx.clip();
        ctx.save(); leftSmoke.render(ctx, clock.time, clock.intensity); ctx.restore();
        ctx.save(); sky.render(ctx, clock.time, clock.intensity); ctx.restore();
        ctx.save(); ground.render(ctx, clock.time, clock.intensity); ctx.restore();
        ctx.save(); suit.render(ctx, clock.time, clock.intensity); ctx.restore();
        ctx.restore();
    }
    canvas.dataset.time = clock.time.toFixed(4);
    canvas.dataset.paused = String(paused); canvas.dataset.ready = String(ready);
    canvas.dataset.intensity = clock.intensity.toFixed(3);
}
function tick(now) {
    if (!ready || paused || document.hidden || failed) { frame = undefined; last = null; return; }
    if (last !== null) clock.update(Math.max(0, (now - last) / 1000));
    last = now;
    if (now - lastPaint >= 1000 / 30) { draw(); lastPaint = now; }
    frame = requestAnimationFrame(tick);
}
function sync() {
    cancelAnimationFrame(frame); frame = undefined; last = null; lastPaint = -Infinity;
    draw();
    if (ready && !paused && !document.hidden && !failed) frame = requestAnimationFrame(tick);
}
function fit() {
    width = innerWidth; height = innerHeight; ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    const c = camera();
    background.style.backgroundSize = `${TITANS_WIDTH * c.scale}px ${TITANS_HEIGHT * c.scale}px`;
    background.style.backgroundPosition = `${c.x}px ${c.y}px`;
    draw();
}
function show() {
    if (embedded || hiddenByUser) return;
    $('controls').classList.remove('hidden'); clearTimeout(hideTimer);
    hideTimer = setTimeout(() => $('controls').classList.add('hidden'), 6000);
}
function setPaused(value) {
    paused = Boolean(value); $('playIcon').textContent = paused ? '▷' : 'Ⅱ';
    $('playText').textContent = paused ? 'Продолжить' : 'Пауза';
    $('play').setAttribute('aria-label', paused ? 'Продолжить анимацию' : 'Приостановить анимацию'); sync();
}
async function full() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (error) { console.warn('Fullscreen unavailable:', error.message); }
    show();
}
$('play').addEventListener('click', () => { setPaused(!paused); show(); });
$('rain').addEventListener('input', () => { clock.update(0, Number($('rain').value) / 100); draw(); show(); });
$('fullscreen').addEventListener('click', full);
window.addEventListener('resize', fit); document.addEventListener('visibilitychange', sync);
document.addEventListener('pointermove', show, {passive: true});
document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPaused(!paused); show(); }
    if (event.key.toLowerCase() === 'f') full();
    if (event.key.toLowerCase() === 'h') { hiddenByUser = !hiddenByUser; $('controls').classList.toggle('hidden', hiddenByUser); }
});
window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'nightfall:settings') return;
    const intensity = Number(event.data.weather);
    if (Number.isFinite(intensity)) clock.update(0, intensity);
    $('rain').value = clock.intensity * 100;
    if (paused !== Boolean(event.data.paused)) setPaused(Boolean(event.data.paused)); else draw();
});
window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); clearTimeout(hideTimer); });
window.addEventListener('pageshow', () => { if (ready) sync(); });
window.nightfallTitans = Object.freeze({getDiagnostics: diagnostics});

function image(url) {
    return new Promise((resolve, reject) => {
        const asset = new Image();
        asset.onload = () => asset.naturalWidth > 0 && asset.naturalHeight > 0 ? resolve(asset) : reject(new Error(`Invalid image: ${url}`));
        asset.onerror = () => reject(new Error(`Cannot load image: ${url}`));
        asset.src = url;
    });
}
async function load() {
    try {
        const entries = Object.entries({...GROUND_ASSET_FILES, ...SKY_ASSET_FILES, ...LEFT_SMOKE_ASSET_FILES, ...SUIT_ASSET_FILES});
        const requests = new Map();
        for (const [, filename] of entries) {
            if (filename.includes('/') || filename.includes('\\')) throw new Error(`Invalid asset filename: ${filename}`);
            if (!requests.has(filename)) requests.set(filename, image(`assets/titans/${filename}?v=15`));
        }
        const [photo, ...assets] = await Promise.all([image('assets/titans.png'), ...entries.map(async ([key, filename]) => [key, await requests.get(filename)])]);
        if (photo.naturalWidth !== TITANS_WIDTH || photo.naturalHeight !== TITANS_HEIGHT) throw new Error('Scene composition has unexpected dimensions.');
        const loaded = Object.fromEntries(assets);
        sky = createSkyEffects(loaded); ground = createGroundEffects(loaded);
        leftSmoke = createLeftSmokeEffects(loaded); suit = createSuitEffects(loaded);
        ready = true; fit(); sync();
        document.dispatchEvent(new CustomEvent('nightfall:ready', {detail: diagnostics()}));
    } catch (error) {
        ready = false; failed = true; cancelAnimationFrame(frame);
        console.error(error); $('error').hidden = false; canvas.dataset.ready = 'false'; canvas.dataset.error = error.message;
    }
}
fit(); show(); load();
