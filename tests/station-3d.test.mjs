import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import {buildStation} from '../station-3d-structure.js';
import {buildHangar} from '../station-3d-hangar.js';

// The new browser scene must not alter existing wallpapers or the installed
// extension's source. Hashes were checked against the saved V10 ZIP baseline.
const baseline = JSON.parse(readFileSync(new URL('./station-3d-preservation.json', import.meta.url)));
for (const [path, expected] of Object.entries(baseline.files)) {
  const actual = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
  assert.equal(actual, expected, `Protected V10 file changed: ${path}`);
}

const station = buildStation(THREE);
const hangar = buildHangar(THREE);
const world = new THREE.Scene();
hangar.group.position.z = 13;
world.add(station.group, hangar.group);
world.updateMatrixWorld(true);
let meshDraws = 0, triangles = 0, shadowMeshes = 0;
const checkedGeometry = new Set();
world.traverse(object => {
  assert(object.matrixWorld.elements.every(Number.isFinite), `Invalid transform: ${object.name}`);
  if (!object.isMesh) return;
  meshDraws++;
  if (object.castShadow) shadowMeshes++;
  const geometry = object.geometry;
  triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
  if (!checkedGeometry.has(geometry)) {
    checkedGeometry.add(geometry);
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      assert(attr.array.every(Number.isFinite), `Invalid ${name}: ${object.name}`);
    }
    if (geometry.index) assert(geometry.index.array.every(index => index < geometry.attributes.position.count), `Out-of-bounds vertex: ${object.name}`);
  }
  if (object.isInstancedMesh) {
    assert(object.instanceMatrix.array.every(Number.isFinite), `Invalid instance transform: ${object.name}`);
    if (object.instanceColor) assert(object.instanceColor.array.every(Number.isFinite), `Invalid instance color: ${object.name}`);
  }
});
const bounds = new THREE.Box3().setFromObject(world);
const extent = bounds.getSize(new THREE.Vector3());
assert(extent.toArray().every(value => Number.isFinite(value) && value > 8), 'Station must occupy genuine volume in all three axes');
assert(meshDraws < 200, `Excessive unbatched geometry: ${meshDraws} mesh draws`);
assert(triangles < 300_000, `Unexpected triangle-budget regression: ${triangles}`);
assert(shadowMeshes > 0, 'Opaque geometry must participate in real shadows');
assert(station.windowCount > 1000, 'Habitat needs individually animated occupied windows');

// Over two minutes every inhabited window must change at least once, while the
// global transfer mechanism continues independently of an inactive hangar.
station.update(0, 1);
const initialWindows = station.windows.instanceColor.array.slice();
const changed = new Uint8Array(station.windowCount);
const initialRotor = station.rotor.rotation.y;
for (let frame = 1; frame <= 3600; frame++) {
  station.update(frame / 30, 1);
  const colors = station.windows.instanceColor.array;
  for (let i = 0; i < changed.length; i++) {
    if (Math.abs(colors[i * 3] - initialWindows[i * 3]) > .01) changed[i] = 1;
  }
}
assert(changed.every(Boolean), `${changed.reduce((a, b) => a + b, 0)} / ${changed.length} windows changed over two minutes`);
assert(Math.abs(station.rotor.rotation.y - initialRotor) > .5, 'Transfer ring must visibly advance');

function visualState(group) {
  const state = [];
  group.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    state.push({
      name: object.name,
      position: object.position.toArray(),
      rotation: object.quaternion.toArray(),
      scale: object.scale.toArray(),
      visible: object.visible,
      intensity: object.intensity,
      color: object.color?.toArray(),
      instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array) : undefined,
      colors: object.instanceColor ? Array.from(object.instanceColor.array) : undefined,
      materials: materials.filter(Boolean).map(material => [material.color?.toArray(), material.emissive?.toArray(), material.emissiveIntensity]),
    });
  });
  return state;
}
const stationPaused = visualState(station.group);
station.update(120, 1);
assert.deepEqual(visualState(station.group), stationPaused, 'Redrawing a paused station must freeze geometry and lights exactly');
for (let i = 1; i <= 90; i++) hangar.update(i / 30, 1, 'service');
const hangarPaused = visualState(hangar.group);
hangar.update(3, 1, 'service');
assert.deepEqual(visualState(hangar.group), hangarPaused, 'Redrawing a paused hangar must freeze work and light exactly');

// Feed the same unscaled wall-clock time to both hangars. This catches activity
// being applied twice, and checks the low-speed portion before any turnaround.
const full = buildHangar(THREE), half = buildHangar(THREE);
const fullBridge = full.group.getObjectByName('Traversing maintenance bridge');
const halfBridge = half.group.getObjectByName('Traversing maintenance bridge');
assert(fullBridge && halfBridge, 'Maintenance bridge missing');
const fullStart = fullBridge.position.clone(), halfStart = halfBridge.position.clone();
for (let frame = 1; frame <= 30; frame++) {
  full.update(frame / 30, 1, 'shift');
  half.update(frame / 30, .5, 'shift');
}
const fullDistance = fullBridge.position.distanceTo(fullStart);
const halfDistance = halfBridge.position.distanceTo(halfStart);
assert(fullDistance > .005, 'Maintenance bridge is not moving');
const activityRatio = halfDistance / fullDistance;
assert(activityRatio > .45 && activityRatio < .55, `Half activity should be about half speed, got ${activityRatio}`);
const mechanisms = ['Traversing maintenance bridge', 'Bridge inspection carriage', 'Side service bay shutter'].map(name => full.group.getObjectByName(name));
assert(mechanisms.every(Boolean), 'A maintenance mechanism is missing');
const stopped = mechanisms.map(visualState);
for (let frame = 31; frame <= 330; frame++) full.update(frame / 30, 0, 'shift');
// Light output changes immediately with activity=0; compare mechanical transforms.
for (let i = 0; i < mechanisms.length; i++) {
  const transformOnly = items => items.map(({name, position, rotation, scale}) => ({name, position, rotation, scale}));
  assert.deepEqual(transformOnly(visualState(mechanisms[i])), transformOnly(stopped[i]), 'Activity=0 must stop the maintenance mechanisms');
}

console.log(`PASS: ${Object.keys(baseline.files).length} protected V10 hashes; finite 3D geometry; ${meshDraws} mesh draws / ${triangles.toLocaleString()} triangles; ${changed.length} independently changing windows; rotor movement; exact pause; zero-activity stop; half-speed ratio ${activityRatio.toFixed(4)}.`);
