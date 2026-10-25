/* Foreground maintenance bay. Every visible piece is geometry in station space. */
export function buildHangar(THREE) {
  const group = new THREE.Group();
  group.name = 'Maintenance hangar';
  const material = {
    shell: new THREE.MeshStandardMaterial({color: 0x68767d, metalness: .72, roughness: .49}),
    panel: new THREE.MeshStandardMaterial({color: 0x929c9d, metalness: .6, roughness: .54}),
    edge: new THREE.MeshStandardMaterial({color: 0x25353e, metalness: .78, roughness: .4}),
    dark: new THREE.MeshStandardMaterial({color: 0x111c24, metalness: .5, roughness: .69}),
    floor: new THREE.MeshStandardMaterial({color: 0x45505a, metalness: .47, roughness: .66}),
    brass: new THREE.MeshStandardMaterial({color: 0xa28a4e, metalness: .64, roughness: .43}),
    safety: new THREE.MeshStandardMaterial({color: 0xb69444, metalness: .32, roughness: .7}),
    glass: new THREE.MeshStandardMaterial({color: 0x173d49, metalness: .77, roughness: .15, emissive: 0x123749, emissiveIntensity: .21}),
    warm: new THREE.MeshStandardMaterial({color: 0xffdc9a, emissive: 0xffb95b, emissiveIntensity: 2.8, roughness: .35}),
    cool: new THREE.MeshStandardMaterial({color: 0xbedce4, emissive: 0x6fbdcc, emissiveIntensity: 1.8, roughness: .35}),
    warning: new THREE.MeshStandardMaterial({color: 0xf5a64b, emissive: 0xff6a16, emissiveIntensity: 1.6}),
  };
  // Tiny deterministic variations keep the broad metal panels from looking plastic.
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const n = Math.sin(i * 18.731 + 1.41) * 43758.5453;
    const value = 175 + Math.floor((n - Math.floor(n)) * 65);
    pixels.set([value, value, value, 255], i * 4);
  }
  const roughness = new THREE.DataTexture(pixels, 64, 64);
  roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
  roughness.magFilter = THREE.LinearFilter;
  roughness.needsUpdate = true;
  for (const key of ['shell', 'panel', 'edge', 'floor', 'brass']) material[key].roughnessMap = roughness;

  const batches = new Map();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  function addGeometry(geometry, key, x = 0, y = 0, z = 0, rotation = [0, 0, 0], target = batches) {
    position.set(x, y, z);
    euler.set(...rotation);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(matrix);
    if (!target.has(key)) target.set(key, []);
    target.get(key).push(flat);
    if (flat !== geometry) geometry.dispose();
  }
  function box(key, x, y, z, w, h, d, rotation = [0, 0, 0], target = batches) {
    addGeometry(new THREE.BoxGeometry(w, h, d), key, x, y, z, rotation, target);
  }
  function cylinder(key, x, y, z, radius, length, rotation = [0, 0, 0], target = batches, radiusTop = radius) {
    addGeometry(new THREE.CylinderGeometry(radiusTop, radius, length, 12), key, x, y, z, rotation, target);
  }
  function bar(key, from, to, width, target = batches) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a), middle = a.clone().add(b).multiplyScalar(.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const geometry = new THREE.CylinderGeometry(width, width, direction.length(), 6);
    geometry.applyQuaternion(q);
    addGeometry(geometry, key, middle.x, middle.y, middle.z, [0, 0, 0], target);
  }
  function finish(target, parent) {
    for (const [key, pieces] of target) {
      const attributes = {};
      for (const name of ['position', 'normal', 'uv']) {
        const size = name === 'uv' ? 2 : 3;
        const length = pieces.reduce((sum, part) => sum + part.getAttribute(name).array.length, 0);
        const values = new Float32Array(length);
        let offset = 0;
        for (const part of pieces) {
          values.set(part.getAttribute(name).array, offset);
          offset += part.getAttribute(name).array.length;
        }
        attributes[name] = new THREE.BufferAttribute(values, size);
      }
      const geometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(attributes)) geometry.setAttribute(name, attr);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material[key]);
      mesh.name = `Bay ${key}`;
      mesh.castShadow = !['warm', 'cool', 'warning'].includes(key);
      mesh.receiveShadow = mesh.castShadow;
      parent.add(mesh);
      for (const part of pieces) part.dispose();
    }
  }

  // A rear canopy and low starboard parapet expose the working apron to the
  // elevated, fixed camera. The open portal still gives the bay real depth.
  box('floor', 0, -1.55, .35, 8.1, .3, 7.3);
  box('edge', 0, -1.78, .2, 8.4, .18, 7.35);
  box('shell', -3.93, .47, -.15, .34, 4.05, 6.1);
  box('shell', 3.93, .47, -1.22, .34, 4.05, 3.96);
  box('shell', 3.93, -1, 1.93, .34, 1.1, 2.35);
  box('edge', 0, .43, -3, 8, 3.95, .26);
  box('shell', 0, 2.55, -1.98, 8.2, .32, 2.3);
  box('edge', 0, 2.32, 2.45, 8.45, .4, .48);
  box('panel', 0, 2.64, 2.46, 8.3, .18, .6);
  for (const x of [-3.6, 3.6]) {
    box('edge', x, .4, 2.5, .48, 4.1, .62);
    box('panel', x, .45, 2.85, .29, 3.45, .12);
    box('brass', x, -1.16, 2.92, .29, .18, .14);
    box('warm', x * .94, .6, 2.47, .055, 2.7, .12);
    for (let y = -1; y < 2.1; y += .48) box('dark', x, y, 2.93, .31, .048, .06);
  }
  // Exterior plates, exposed longitudinal ribs and recessed access hatches.
  for (let z = -2.6; z < 2.2; z += .8) {
    for (const x of [-4.13, 4.13]) {
      const lowParapet = x > 0 && z > .6;
      box('panel', x, lowParapet ? -.92 : .6, z, .16, lowParapet ? .85 : 2.8, .68);
      box('edge', x * 1.013, lowParapet ? -.95 : .55, z - .38, .13, lowParapet ? 1.15 : 3.45, .12);
      box('dark', x * 1.025, -.5, z, .06, .48, .46);
      box('brass', x * 1.036, lowParapet ? -.44 : 1.67, z, .08, .065, .25);
    }
    if (z < -.8) {
      box('panel', 0, 2.75, z, 7.6, .12, .65);
      box('dark', 0, 2.82, z, 1.25, .045, .36);
    }
  }
  for (const x of [-2.8, -1.4, 1.4, 2.8]) {
    box('edge', x, 2.82, -1.98, .09, .13, 2.3);
    box('dark', x, -1.382, .35, .045, .025, 6.7);
  }
  // Deck seams and inset guidance strips are on the actual floor plane.
  for (let z = -2.6; z < 3.8; z += .58) box('edge', 0, -1.384, z, 7.3, .026, .025);
  for (const x of [-2.35, 2.35]) {
    box('safety', x, -1.376, .9, .065, .026, 5.4);
    for (let z = -1.9; z < 3.5; z += .72) box('warm', x + .14, -1.35, z, .055, .033, .19);
  }
  box('safety', 0, -1.374, 3.18, 6.5, .03, .11);
  for (let x = -3.1; x <= 3.2; x += .43) box('dark', x, -1.35, 3.17, .16, .032, .26, [0, -.5, 0]);
  for (let x = -3.15; x <= 3.2; x += .72) {
    box('edge', x, -1.78, 3.78, .2, .32, .24);
    box('cool', x, -1.67, 3.92, .13, .065, .035);
  }
  // Interior ribs, wall recesses, pipework and a raised service walk.
  for (let z = -2.45; z < 2.3; z += 1.14) {
    for (const x of [-3.67, 3.67]) {
      box('edge', x, .35, z, .2, 3.6, .16);
      if (x < 0 || z < .5) {
        box('panel', x * .96, .5, z + .38, .16, .87, .57);
        box('dark', x * .935, .63, z + .4, .06, .45, .4);
      }
      box('warm', x * .91, 1.75, z + .25, .08, .075, .5);
    }
    box('edge', 0, 2.28, z, 7.4, .18, .17);
  }
  for (const y of [1.9, 2.07]) cylinder('brass', -3.54, y, -.2, .037, 5.4, [Math.PI / 2, 0, 0]);
  box('floor', -3.12, -.73, -.2, .88, .12, 5.5);
  for (const x of [-3.5, -2.7]) {
    bar('edge', [x, .01, -2.7], [x, .01, 2.23], .027);
    bar('edge', [x, -.34, -2.7], [x, -.34, 2.23], .022);
    for (let z = -2.65; z <= 2.3; z += .69) bar('brass', [x, -.72, z], [x, .01, z], .022);
  }
  for (let i = 0; i < 5; i++) box('floor', -3.12, -1.35 + i * .12, 2.95 - i * .14, .8, .09, .2);

  // Back wall cabinets and a small side bay with an independently moving shutter.
  for (let x = -3.1; x < 1.1; x += .72) {
    box('panel', x, -.38, -2.78, .61, 1.8, .22);
    box('dark', x, .12, -2.62, .42, .55, .09);
    box('cool', x - .12, -.01, -2.56, .12, .045, .025);
    for (let i = 0; i < 4; i++) box('edge', x, -.63 - i * .12, -2.63, .4, .025, .08);
  }
  box('dark', 2.3, -.22, -2.75, 1.8, 2.32, .3);
  box('brass', 2.3, .97, -2.5, 1.83, .08, .13);
  for (const x of [1.36, 3.24]) box('edge', x, -.22, -2.5, .15, 2.45, .2);
  const shutter = new THREE.Group();
  shutter.name = 'Side service bay shutter';
  const shutterPanels = [];
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.68, .32, .14), material.panel);
    leaf.position.set(2.3, -1.18 + i * .345, -2.46);
    leaf.castShadow = leaf.receiveShadow = true;
    shutterPanels.push(leaf);
    shutter.add(leaf);
  }
  group.add(shutter);

  // A parked utility tug has landing feet, armoured hull and inactive engines.
  const craftX = -.62, craftZ = .35;
  const outline = [[-.45, -1.52], [-.71, -.95], [-.65, .75], [-.35, 1.58], [.35, 1.58], [.65, .75], [.71, -.95], [.45, -1.52]];
  const shape = new THREE.Shape();
  shape.moveTo(...outline[0]);
  for (const p of outline.slice(1)) shape.lineTo(...p);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, {depth: .36, bevelEnabled: true, bevelSize: .11, bevelThickness: .08, bevelSegments: 1, steps: 1});
  addGeometry(hull, 'shell', craftX, -.77, craftZ, [Math.PI / 2, 0, 0]);
  box('panel', craftX, -.66, craftZ + .1, .78, .26, 1.65);
  box('edge', craftX, -.36, craftZ + .12, .64, .33, .85, [.1, 0, 0]);
  box('glass', craftX, -.32, craftZ + .57, .51, .17, .04, [.18, 0, 0]);
  box('panel', craftX, -.17, craftZ + .05, .7, .09, .89);
  for (const x of [craftX - .71, craftX + .71]) {
    cylinder('edge', x, -.88, craftZ - .5, .21, 1.8, [Math.PI / 2, 0, 0]);
    cylinder('brass', x, -.88, craftZ - 1.4, .22, .12, [Math.PI / 2, 0, 0]);
    cylinder('dark', x, -.88, craftZ - 1.48, .17, .08, [Math.PI / 2, 0, 0]);
    box('panel', x, -.65, craftZ - .35, .25, .12, .89);
    for (let z = -.9; z < .6; z += .22) box('dark', x, -.575, craftZ + z, .22, .03, .055);
  }
  for (const x of [craftX - .48, craftX + .48]) for (const z of [-.8, .9]) {
    bar('edge', [x * .95, -.98, craftZ + z], [x, -1.3, craftZ + z + .12], .055);
    box('dark', x, -1.34, craftZ + z + .12, .27, .08, .36);
  }
  box('safety', craftX, -.512, craftZ + 1.05, .23, .025, .53);

  // Put the active welding jig on the exposed port apron, in direct camera view.
  const jigX = -4.9, jigZ = 2.15;
  box('edge', 2.77 + jigX, -1.04, .35 + jigZ, 1.14, .65, 1.5);
  box('panel', 2.74 + jigX, -.68, .35 + jigZ, 1.23, .1, 1.59);
  box('brass', 2.56 + jigX, -.57, .52 + jigZ, .7, .12, .84, [0, .16, 0]);
  for (const z of [.17, .83]) box('dark', 2.65 + jigX, -.45, z + jigZ, .96, .12, .09);
  bar('edge', [3.25 + jigX, -.64, -.15 + jigZ], [3.25 + jigX, .45, -.15 + jigZ], .075);
  bar('brass', [3.25 + jigX, .45, -.15 + jigZ], [2.71 + jigX, .55, .34 + jigZ], .05);
  bar('edge', [2.71 + jigX, .55, .34 + jigZ], [2.49 + jigX, -.38, .54 + jigZ], .035);
  for (const [x, z, h] of [[2.9, 1.75, .47], [3.12, -1.65, .77], [-2.16, -2.22, .58]]) {
    box('shell', x, -1.39 + h / 2, z, .65, h, .65);
    for (const dz of [-.25, .25]) box('brass', x, -1.39 + h / 2, z + dz, .68, h + .02, .04);
    box('dark', x, -1.375 + h, z, .29, .035, .32);
  }

  // Rails extend onto the exposed apron; the bridge and its moving light remain
  // visible from the high three-quarter view instead of disappearing under a roof.
  for (const x of [-3.24, 3.24]) {
    box('edge', x, 1.58, .4, .16, .23, 6.5);
    box('brass', x, 1.72, .4, .1, .045, 6.6);
    bar('edge', [x, -1.35, 3.55], [x, 1.58, 3.55], .067);
    bar('brass', [x, 1.55, 3.55], [x, .6, 2.5], .045);
  }
  const bridge = new THREE.Group();
  bridge.name = 'Traversing maintenance bridge';
  const bridgeBatches = new Map();
  box('safety', 0, 1.58, 0, 6.3, .23, .35, [0, 0, 0], bridgeBatches);
  box('edge', 0, 1.76, 0, 6.35, .1, .42, [0, 0, 0], bridgeBatches);
  for (const x of [-3.15, 3.15]) {
    box('dark', x, 1.56, 0, .3, .36, .68, [0, 0, 0], bridgeBatches);
    cylinder('brass', x, 1.65, .2, .13, .31, [0, 0, Math.PI / 2], bridgeBatches);
  }
  finish(bridgeBatches, bridge);
  const trolley = new THREE.Group();
  trolley.name = 'Bridge inspection carriage';
  const trolleyBatches = new Map();
  box('edge', 0, 1.42, 0, .57, .25, .63, [0, 0, 0], trolleyBatches);
  box('panel', 0, 1.2, 0, .41, .2, .4, [0, 0, 0], trolleyBatches);
  cylinder('brass', 0, .94, 0, .08, .35, [0, 0, 0], trolleyBatches);
  box('cool', 0, .74, 0, .29, .045, .24, [0, 0, 0], trolleyBatches);
  finish(trolleyBatches, trolley);
  bridge.add(trolley);
  group.add(bridge);

  for (let x = -2.6; x <= 2.7; x += 1.3) {
    box('edge', x, 2.14, 2.29, .86, .15, .19);
    box('warm', x, 2.045, 2.29, .61, .045, .15);
  }
  box('warning', -3.65, 2.45, 2.89, .11, .11, .07);
  box('warning', 3.65, 2.45, 2.89, .11, .11, .07);
  finish(batches, group);

  // Real local lights illuminate and shade nearby surfaces in world space.
  const lamps = [];
  for (const [x, y, z] of [[-2.7, 1.72, 1.5], [2.7, 1.72, 1.5], [0, 1.65, -1.7]]) {
    const light = new THREE.PointLight(0xffcf8a, 20, 8.5, 2);
    light.position.set(x, y, z);
    group.add(light);
    lamps.push(light);
  }
  const inspection = new THREE.SpotLight(0xafdfff, 22, 7, .58, .62, 1.6);
  inspection.position.set(0, .66, 0);
  inspection.target.position.set(0, -1.3, 0);
  inspection.castShadow = true;
  inspection.shadow.mapSize.set(512, 512);
  inspection.shadow.camera.near = .12;
  inspection.shadow.camera.far = 8;
  inspection.shadow.bias = -.0006;
  inspection.shadow.normalBias = .025;
  trolley.add(inspection, inspection.target);
  const weld = new THREE.PointLight(0x91caff, 0, 4.7, 2);
  weld.position.set(2.49 + jigX, -.36, .54 + jigZ);
  group.add(weld);
  const sparkMaterial = new THREE.MeshBasicMaterial({color: 0xffcb78, toneMapped: false});
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(.016, 5, 4), sparkMaterial, 13);
  sparks.name = 'Contact welding sparks';
  sparks.frustumCulled = false;
  group.add(sparks);
  const arc = new THREE.Mesh(new THREE.SphereGeometry(.033, 8, 6), new THREE.MeshBasicMaterial({color: 0xd3edff, toneMapped: false}));
  arc.position.copy(weld.position);
  group.add(arc);
  const transform = new THREE.Object3D();
  let previousTime = null, mechanismTime = 0;
  let selectedMode = 'shift';
  const clamp = THREE.MathUtils.clamp;
  function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function update(t, activity = 1, mode = selectedMode) {
    const amount = clamp(Number(activity) || 0, 0, 1);
    const dt = previousTime === null ? 0 : Math.max(0, t - previousTime);
    previousTime = t;
    mechanismTime += dt * amount;
    selectedMode = typeof mode === 'string' ? mode : 'shift';
    const night = selectedMode === 'night';
    const service = selectedMode === 'service';
    const workT = mechanismTime;
    bridge.position.z = 2.78 + .67 * Math.sin(workT * .17);
    trolley.position.x = 1.75 * Math.sin(workT * .143 + .7);
    inspection.intensity = amount * (service ? 38 : night ? 9 : 15);
    inspection.angle = service ? .64 : .5;
    const cycle = (workT + 7) % 36;
    const open = smooth(7, 12, cycle) * (1 - smooth(24, 30, cycle));
    for (let i = 0; i < shutterPanels.length; i++) shutterPanels[i].position.y = -1.18 + i * .345 + open * (1.9 - i * .28);
    lamps.forEach((lamp, i) => {
      lamp.color.set(night ? 0x9bb9cb : service ? 0xdbe5dc : 0xffcf8a);
      lamp.intensity = (night ? 7 : service ? 23 : 19) * (1 + .025 * Math.sin(t * .37 + i));
    });
    material.warm.emissive.set(night ? 0xffbd6e : 0xffbb64);
    material.warm.emissiveIntensity = night ? 1.2 : 2.8;
    material.cool.emissiveIntensity = service ? 3 : night ? 1.2 : 1.8;
    material.warning.emissiveIntensity = 1.3 + .8 * Math.pow(Math.max(0, Math.sin(t * 2.25)), 6);
    const phase = (workT + 2.8) % 12.7;
    const gate = smooth(2.1, 2.2, phase) * (1 - smooth(3.65, 3.8, phase));
    const pulse = .55 + .45 * Math.pow(Math.sin(workT * 47.1), 2);
    const welding = amount > 0 ? gate * pulse * (night ? .55 : service ? 1.35 : 1) : 0;
    weld.intensity = welding * 23;
    arc.visible = welding > .025;
    arc.scale.setScalar(.8 + welding * 1.7);
    sparks.visible = gate > .01 && amount > 0;
    for (let i = 0; i < 13; i++) {
      const age = ((workT * 2.2 + i * .137) % 1) * .47;
      const angle = i * 2.39996;
      const speed = .32 + (i % 4) * .11;
      transform.position.set(weld.position.x + Math.cos(angle) * speed * age, weld.position.y + .72 * age - 2.3 * age * age, weld.position.z + Math.sin(angle) * speed * age);
      transform.scale.setScalar(gate * (1 - age / .47) * (i % 3 === 0 ? 1.5 : 1));
      transform.updateMatrix();
      sparks.setMatrixAt(i, transform.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }
  update(0, 1, 'shift');
  return {group, update, setMode(mode) { selectedMode = mode; }};
}
