// This module is safe to import from both Shell and the preferences process.
// Native drawing code is loaded only when a scene is selected.
import {SCENES} from './scene-catalog.js';
export {SCENES} from './scene-catalog.js';
export const STATION_MODES = Object.freeze([
    Object.freeze({id: 'shift', name: 'Рабочая смена'}),
    Object.freeze({id: 'night', name: 'Ночной режим'}),
    Object.freeze({id: 'service', name: 'Техобслуживание'}),
]);

export function getScene(id) {
    return SCENES.find(scene => scene.id === id) ?? SCENES[0];
}

export async function createRenderer(sceneId, extensionPath) {
    const scene = getScene(sceneId);
    const imagePath = `${extensionPath}/${scene.image}`;
    if (scene.id === 'titans') {
        const {createTitansRenderer} = await import('./titans-renderer.js');
        return createTitansRenderer(imagePath);
    }
    if (scene.id === 'abyss') {
        const {createAbyssRenderer} = await import('./abyss-renderer.js');
        return createAbyssRenderer(imagePath);
    }
    if (scene.id === 'junction') {
        const {createJunctionRenderer} = await import('./junction-renderer.js');
        return createJunctionRenderer(imagePath);
    }
    if (scene.id === 'cloudcity') {
        const {createCloudcityRenderer} = await import('./cloudcity-renderer.js');
        return createCloudcityRenderer(imagePath);
    }
    if (scene.id === 'station') {
        const {createStationRenderer} = await import('./station-renderer.js');
        return createStationRenderer(imagePath);
    }
    if (scene.id === 'polar') {
        const {createPolarRenderer} = await import('./polar-renderer.js');
        return createPolarRenderer(imagePath);
    }

    const {createSceneRenderer} = await import('./native-renderer.js');
    const renderer = createSceneRenderer(imagePath);
    const update = renderer.update.bind(renderer);
    const originalAlpha = renderer.rain.map(layer => layer.alpha);
    // Keep the V4 renderer intact. The shared weather control adjusts only the
    // opacity of its existing rain, preserving traffic and all scene geometry.
    renderer.update = (dt, pointer, weather = 1) => {
        const intensity = Math.max(0, Math.min(1, Number.isFinite(weather) ? weather : 1));
        renderer.rain.forEach((layer, index) => {
            layer.alpha = originalAlpha[index] * intensity;
        });
        update(dt, pointer, intensity);
    };
    return renderer;
}
