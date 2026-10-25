/* Procedural geometry for the fixed-camera station preview. All dimensions are
 * world-space metres at model scale; no photographic plate is used by this scene. */
export function buildStation(THREE) {
  const group = new THREE.Group();
  group.name = 'Helios orbital habitat';
  let randomState = 0x51ab83d;
  const rnd = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
  const TAU = Math.PI * 2;
  const v = (r, y, a) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  // Locally generated, nonuniform PBR surfaces. The same subtle milling marks,
  // oxidised seams and scratches affect albedo, roughness and bump together.
  const textureSize = 256;
  const albedoPixels = new Uint8Array(textureSize * textureSize * 4);
  const reliefPixels = new Uint8Array(textureSize * textureSize * 4);
  const roughPixels = new Uint8Array(textureSize * textureSize * 4);
  const hash = (x, y) => { let h = Math.imul(x + 1171, 374761393) ^ Math.imul(y + 771, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295; };
  for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) {
    const at = (y * textureSize + x) * 4, grain = hash(x, y) - .5;
    const edge = Math.min(x, y, 255 - x, 255 - y);
    const seam = edge < 2 ? 1 : edge < 4 ? .25 : 0;
    const inset = ((x === 19 || x === 236) && y > 19 && y < 237) || ((y === 19 || y === 236) && x > 19 && x < 237);
    const streak = (hash(Math.floor(x / 3), 991) - .5) * 6 + Math.sin(y * .06 + x * .03) * 2;
    const scratch = hash(Math.floor(x / 25), y) > .989 && x % 25 < 11;
    const screw = [[11, 11], [244, 11], [11, 244], [244, 244]].some(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2 < 7);
    const light = Math.max(0, Math.min(255, 224 + grain * 16 + streak - seam * 68 - (inset ? 21 : 0) - (screw ? 55 : 0) + (scratch ? 15 : 0)));
    const bump = Math.max(0, Math.min(255, 145 + grain * 10 - seam * 69 - (inset ? 24 : 0) - (screw ? 33 : 0)));
    const rough = Math.max(0, Math.min(255, 170 + grain * 20 + seam * 40 + Math.sin(x * .025 + y * .033) * 13));
    albedoPixels.set([light, light, light, 255], at);
    reliefPixels.set([bump, bump, bump, 255], at);
    roughPixels.set([rough, rough, rough, 255], at);
  }
  const makeTexture = (pixels, srgb = false) => {
    const tex = new THREE.DataTexture(pixels, textureSize, textureSize, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 4; tex.needsUpdate = true; return tex;
  };
  const surface = { map: makeTexture(albedoPixels, true), bumpMap: makeTexture(reliefPixels), bumpScale: .045, roughnessMap: makeTexture(roughPixels) };
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b8b9, metalness: .57, roughness: 1, vertexColors: true, ...surface });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .61, roughness: 1, ...surface });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x283038, metalness: .54, roughness: 1, ...surface });
  const titaniumMaterial = new THREE.MeshStandardMaterial({ color: 0x858d92, metalness: .66, roughness: 1, ...surface });
  const radiatorMaterial = new THREE.MeshStandardMaterial({ color: 0x152333, metalness: .75, roughness: .48 });
  const bronzeMaterial = new THREE.MeshStandardMaterial({ color: 0x655a43, metalness: .78, roughness: .48 });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const batches = new Map();
  const color = new THREE.Color();
  const addBox = (name, material, x, y, z, sx, sy, sz, ry = 0, tint = null, parent = group) => {
    const key = name;
    if (!batches.has(key)) batches.set(key, { material, entries: [], parent, geometry: boxGeometry });
    quat.setFromAxisAngle(yAxis, ry);
    matrix.compose(new THREE.Vector3(x, y, z), quat, scale.set(sx, sy, sz));
    batches.get(key).entries.push({ matrix: matrix.clone(), color: new THREE.Color(tint ?? 0xffffff) });
  };
  const addBeam = (name, material, a, b, radius, parent = group, tint = 0xffffff) => {
    if (!batches.has(name)) batches.set(name, { material, entries: [], parent, geometry: cylinderGeometry });
    const d = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    quat.setFromUnitVectors(yAxis, d.clone().normalize());
    matrix.compose(center, quat, scale.set(radius, d.length(), radius));
    batches.get(name).entries.push({ matrix: matrix.clone(), color: new THREE.Color(tint) });
  };
  const addTiltedBox = (name, material, p, dimensions, rotation, tint = 0xffffff) => {
    if (!batches.has(name)) batches.set(name, { material, entries: [], parent: group, geometry: boxGeometry });
    quat.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(new THREE.Vector3(...p), quat, scale.set(...dimensions));
    batches.get(name).entries.push({ matrix: matrix.clone(), color: new THREE.Color(tint) });
  };
  const radialBox = (name, material, r, y, a, width, height, depth, tint, parent) => {
    const p = v(r, y, a);
    addBox(name, material, p.x, p.y, p.z, width, height, depth, a, tint, parent);
  };
  const mesh = (geometry, material, parent = group) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  // The hull has eight actual facets in cross-section, with open sector joints.
  // The foreground aperture is left empty for the separate hangar assembly.
  const profile = [[9, -.82], [9.5, -1.5], [13.38, -1.5], [14, -.75], [14, 1.23], [13.16, 2.1], [9.82, 2.1], [9, 1.23]];
  const positions = [], normals = [], colors = [], uvs = [];
  const tri = (a, b, c, tint) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); colors.push(tint.r, tint.g, tint.b);
      if (Math.abs(n.y) > .5) uvs.push(p.x * .65, p.z * .65);
      else if (Math.abs(n.x) > Math.abs(n.z)) uvs.push(p.z * .65, p.y * .65);
      else uvs.push(p.x * .65, p.y * .65);
    }
  };
  const quad = (a, b, c, d, tint) => { tri(a, b, c, tint); tri(a, c, d, tint); };
  const sectors = [];
  for (let i = 2; i <= 29; i++) {
    const a = (i === 2 ? Math.PI / 10 : i / 32 * TAU) + .009;
    const b = (i === 29 ? TAU - Math.PI / 10 : (i + 1) / 32 * TAU) - .009;
    const mid = (a + b) / 2;
    sectors.push({ a, b, mid, index: i });
    const shade = .74 + rnd() * .24;
    for (let j = 0; j < profile.length; j++) {
      const [r1, y1] = profile[j], [r2, y2] = profile[(j + 1) % profile.length];
      const factor = j === 3 || j === 7 ? .41 : j === 5 ? 1 : .72;
      const tint = new THREE.Color().setRGB(shade * factor, shade * factor * 1.02, shade * factor * 1.04);
      quad(v(r1, y1, a), v(r1, y1, b), v(r2, y2, b), v(r2, y2, a), tint);
    }
    const capColor = new THREE.Color(0x303940);
    for (let j = 1; j < profile.length - 1; j++) {
      tri(v(...profile[0], a), v(...profile[j + 1], a), v(...profile[j], a), capColor);
      tri(v(...profile[0], b), v(...profile[j], b), v(...profile[j + 1], b), capColor);
    }
    // Armoured top plates vary in depth and height rather than repeating a texture.
    for (let lane = 0; lane < 3; lane++) {
      for (let panel = 0; panel < 3; panel++) {
        const angle = a + (b - a) * (panel + .5) / 3;
        const shade = .48 + rnd() * .24;
        const tint = new THREE.Color().setRGB(shade, shade * 1.025, shade * 1.04);
        radialBox('armour plates', metalMaterial, 10.35 + lane * 1.1, 2.14 + rnd() * .06, angle, .56 + lane * .07, .065, .96, tint);
        if (rnd() > .61) {
          radialBox('roof recesses', darkMaterial, 10.35 + lane * 1.1, 2.195, angle, .32, .025, .44);
          for (let fin = 0; fin < 5; fin++) radialBox('vent fins', titaniumMaterial, 10.18 + lane * 1.1 + fin * .075, 2.22, angle, .34, .032, .018);
        }
        if (rnd() > .7) radialBox('equipment boxes', titaniumMaterial, 10.35 + lane * 1.1, 2.3, angle + .012, .23, .23, .45);
      }
    }
    // Recessed dark bands and three habitable decks on both inner and outer faces.
    for (const radius of [8.974, 14.026]) {
      for (const deck of [-.51, .15, .79]) {
        const segments = 8;
        for (let j = 0; j < segments; j++) radialBox('window recess', darkMaterial, radius, deck, a + (b - a) * (j + .5) / segments, (b - a) * radius / segments * .99, .25, .035);
      }
      for (const railY of [-1.03, -.12, .51, 1.15]) {
        for (let j = 0; j < 3; j++) radialBox('deck rails', titaniumMaterial, radius + (radius > 10 ? .04 : -.04), railY, a + (b - a) * (j + .5) / 3, (b - a) * radius / 3, .065, .11);
      }
    }
    // Exposed ribs stitch each modular sector into the pressure ring.
    if (i % 2 === 0) {
      const angle = a - .009;
      radialBox('sector ribs', darkMaterial, 11.5, 2.22, angle, .22, .18, 4.05);
      radialBox('rib caps', titaniumMaterial, 11.5, 2.32, angle, .072, .09, 4.12);
      for (const radius of [8.9, 14.1]) radialBox('sector ribs', darkMaterial, radius, .2, angle, .27, 2.8, .17);
      for (let lane = 0; lane < 4; lane++) radialBox('conduit collars', bronzeMaterial, 10.08 + lane * .9, 2.37, angle, .36, .08, .12);
    }
  }
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ringGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  ringGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ringGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ringGeometry.computeBoundingSphere();
  mesh(ringGeometry, hullMaterial).name = 'Sectioned pressure hull';

  // Warm windows are individual physical apertures, with their own occupancy times.
  const windowData = [];
  const windowEntries = [];
  const addWindow = (x, y, z, sx, sy, sz, angle, warmth = 1) => {
    quat.setFromAxisAngle(yAxis, angle);
    matrix.compose(new THREE.Vector3(x, y, z), quat, scale.set(sx, sy, sz));
    const on = rnd() > .27;
    const tint = warmth > .5 ? new THREE.Color().setRGB(2.1 + rnd() * 1.2, .8 + rnd() * .68, .22 + rnd() * .28) : new THREE.Color().setRGB(.52, 1.08, 1.48);
    windowEntries.push(matrix.clone());
    windowData.push({ tint, value: on ? 1 : .013, target: on ? 1 : .013, next: 3 + rnd() * 110, period: 15 + rnd() * 140 });
  };
  for (const { a, b, index } of sectors) {
    for (const r of [8.94, 14.065]) for (const y of [-.51, .15, .79]) {
      const count = r > 10 ? 18 : 12;
      for (let j = 0; j < count; j++) {
        const angle = a + (b - a) * (j + .5) / count;
        const p = v(r, y + (rnd() - .5) * .04, angle);
        addWindow(p.x, p.y, p.z, .063 + rnd() * .055, .055 + rnd() * .045, .018, angle, index % 9 === 0 ? 0 : 1);
      }
    }
  }

  // Long octagonal service spine; reinforcement collars remain visibly separate.
  for (let i = 0; i < 10; i++) {
    const z = -20.7 + i * 2.94;
    const radius = i < 2 ? 1.32 + i * .22 : i > 7 ? 1.75 : 2.1;
    const segment = mesh(new THREE.CylinderGeometry(radius, radius, 2.7, 8, 1), i % 3 === 0 ? titaniumMaterial : metalMaterial);
    segment.rotation.x = Math.PI / 2; segment.rotation.y = Math.PI / 8; segment.position.set(0, .8, z);
    if (i % 3 !== 0) segment.material = metalMaterial.clone(), segment.material.color.setHex(i % 2 ? 0x70787e : 0x939a9e);
    for (const offset of [-1.22, 1.22]) {
      const collar = mesh(new THREE.CylinderGeometry(radius + .13, radius + .13, .19, 8), darkMaterial);
      collar.rotation.x = Math.PI / 2; collar.position.set(0, .8, z + offset);
    }
    for (const side of [-1, 1]) {
      addBox('spine recesses', darkMaterial, side * (radius + .02), .95, z, .1, .64, 2.13);
      for (let j = 0; j < 12; j++) addWindow(side * (radius + .09), 1.03 + (j % 2) * .22, z - 1.05 + j * .185, .024, .07, .11, 0, i % 4 ? 1 : 0);
      addBox('spine conduits', titaniumMaterial, side * (radius + .08), .32, z, .12, .12, 2.74);
      addBox('spine conduits', bronzeMaterial, side * (radius + .08), .51, z, .07, .07, 2.74);
    }
    addBox('spine roof machinery', darkMaterial, 0, radius + .71, z, 1.46, .3, 1.94);
    for (let j = 0; j < 3; j++) addBox('spine armour', titaniumMaterial, -.49 + j * .49, radius + .94, z, .39, .15 + rnd() * .13, 1.6);
    if (i > 1 && i < 8) for (const side of [-1, 1]) addBox('side service pods', titaniumMaterial, side * (radius + .43), .56, z + .6, .68, .82, .95);
    // Faceted armour, exposed axial plumbing and service pallets break up each barrel.
    for (let face = 0; face < 8; face++) {
      const angle = face * Math.PI / 4, rr = radius * .932;
      const px = -Math.sin(angle) * rr, py = .8 + Math.cos(angle) * rr;
      const shade = .46 + rnd() * .18;
      addTiltedBox('spine facet plating', metalMaterial, [px, py, z], [radius * .65, .095, 2.23], [0, 0, angle], new THREE.Color(shade, shade * 1.025, shade * 1.04));
      for (const side of [-1, 1]) {
        const tangent = radius * .29 * side;
        addTiltedBox('spine facet seams', darkMaterial, [px + Math.cos(angle) * tangent, py + Math.sin(angle) * tangent, z], [.033, .12, 2.28], [0, 0, angle]);
      }
      if (face === 1 || face === 7) {
        addTiltedBox('spine exposed utilities', darkMaterial, [px * 1.07, .8 + (py - .8) * 1.07, z + .28], [.48, .24, 1.4], [0, 0, angle]);
        for (let rib = 0; rib < 5; rib++) addTiltedBox('utility ribs', titaniumMaterial, [px * 1.13, .8 + (py - .8) * 1.13, z - .26 + rib * .25], [.55, .06, .075], [0, 0, angle]);
      }
    }
    for (const side of [-1, 1]) {
      const xx = side * (radius + .22);
      addBox('axial machinery racks', darkMaterial, xx, -.05, z - .48, .42, .37, 1.12);
      for (let g = 0; g < 4; g++) addBox('axial pump cells', titaniumMaterial, xx + side * .18, -.05, z - .91 + g * .27, .16, .25, .18);
    }
  }
  // The main service corridor reaches the rear of the foreground hangar.
  addBox('hangar connecting corridor', darkMaterial, 0, -.15, 8.55, 2.35, 1.65, 3.0);
  addBox('hangar corridor armour', titaniumMaterial, 0, .74, 8.55, 2.6, .12, 3.1);
  for (const side of [-1, 1]) {
    addBox('hangar corridor pipes', bronzeMaterial, side * 1.27, .25, 8.55, .10, .10, 3.1);
    for (let j = 0; j < 4; j++) addBox('hangar corridor ribs', titaniumMaterial, side * 1.23, -.15, 7.35 + j * .78, .12, 1.65, .14);
  }
  // Structural spokes have open triangular webs: the background is visible through them.
  for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI * .76, -Math.PI * .76]) {
    const start = 2.1, end = 9.15;
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    for (const side of [-1, 1]) {
      const a = v(start, -.5, angle).addScaledVector(tangent, side * .39);
      const b = v(end, -.5, angle).addScaledVector(tangent, side * .39);
      addBeam('spoke rails', titaniumMaterial, a, b, .065);
      addBeam('spoke rails', titaniumMaterial, a.clone().add(new THREE.Vector3(0, .78, 0)), b.clone().add(new THREE.Vector3(0, .78, 0)), .055);
      const pieces = 8;
      for (let j = 0; j < pieces; j++) {
        const p = a.clone().lerp(b, j / pieces), q = a.clone().lerp(b, (j + 1) / pieces);
        addBeam('spoke webs', titaniumMaterial, p, q.clone().add(new THREE.Vector3(0, .78, 0)), .032);
        addBeam('spoke webs', titaniumMaterial, p.clone().add(new THREE.Vector3(0, .78, 0)), q, .032);
      }
    }
    const p = v((start + end) / 2, -.39, angle);
    addBox('spoke walkways', darkMaterial, p.x, p.y, p.z, .72, .08, end - start, angle);
    for (let j = 0; j < 6; j++) radialBox('spoke worklights', windowMaterial, 3 + j, .36, angle, .035, .025, .2, new THREE.Color(1.5, .78, .28));
  }

  // The command assembly has chamfered, tapering armour and offset modules;
  // the diagonal planes catch light independently from the inhabited ring.
  const armouredPod = (width, height, depth, taper = .83, shear = 0) => {
    const bx = width / 2, bz = depth / 2, bevel = Math.min(width, depth) * .16;
    const outline = [[-bx + bevel, -bz], [bx - bevel, -bz], [bx, -bz + bevel], [bx, bz - bevel], [bx - bevel, bz], [-bx + bevel, bz], [-bx, bz - bevel], [-bx, -bz + bevel]];
    const ps = [], ns = [], uv = [];
    const push = (a, b, c, hint) => {
      let normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.dot(hint) < 0) { [b, c] = [c, b]; normal.negate(); }
      for (const p of [a, b, c]) {
        ps.push(p.x, p.y, p.z); ns.push(normal.x, normal.y, normal.z);
        if (Math.abs(normal.y) > .7) uv.push(p.x * .6, p.z * .6);
        else if (Math.abs(normal.z) > Math.abs(normal.x)) uv.push(p.x * .6, p.y * .6);
        else uv.push(p.z * .6, p.y * .6);
      }
    };
    for (let j = 0; j < 8; j++) {
      const p = outline[j], q = outline[(j + 1) % 8];
      const a = new THREE.Vector3(p[0], -height / 2, p[1]), b = new THREE.Vector3(q[0], -height / 2, q[1]);
      const c = new THREE.Vector3(q[0] * taper + shear, height / 2, q[1] * taper), d = new THREE.Vector3(p[0] * taper + shear, height / 2, p[1] * taper);
      const hint = a.clone().add(b).setY(0).normalize();
      push(a, b, c, hint); push(a, c, d, hint);
      push(new THREE.Vector3(shear, height / 2, 0), c, d, yAxis);
      push(new THREE.Vector3(0, -height / 2, 0), a, b, new THREE.Vector3(0, -1, 0));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geometry;
  };
  for (const p of [
    { x: .1, y: 3.15, z: -8.25, w: 4.5, h: 1.22, d: 4.6, taper: .87, shear: -.12 },
    { x: -.6, y: 5.15, z: -9.15, w: 2.2, h: 3.1, d: 3.0, taper: .64, shear: .24 },
    { x: 1.55, y: 4.05, z: -8.1, w: 2.1, h: .95, d: 3.8, taper: .87, shear: .1 },
    { x: -1.88, y: 3.95, z: -7.15, w: 1.0, h: 1.85, d: 1.85, taper: .74, shear: -.11 },
    { x: -.4, y: 6.94, z: -9.25, w: 1.4, h: .72, d: 1.65, taper: .74, shear: .14 }
  ]) {
    const shell = mesh(armouredPod(p.w, p.h, p.d, p.taper, p.shear), titaniumMaterial);
    shell.position.set(p.x, p.y, p.z);
  }
  // Cantilevered glazed bridge, external cable ladders and narrow service galleries.
  addBox('command bridge glazing', darkMaterial, .6, 3.67, -5.98, 3.65, .35, .13);
  addBox('command bridge canopy', titaniumMaterial, .6, 3.93, -6.12, 3.88, .14, .56);
  for (let x = -1.1; x < 2.35; x += .16) addWindow(x, 3.67, -5.9, .11, .105, .018, 0);
  addBox('command side glazing', darkMaterial, 2.52, 4.04, -8.05, .12, .23, 2.85);
  for (let j = 0; j < 14; j++) addWindow(2.59, 4.04, -9.3 + j * .19, .018, .085, .11, 0);
  for (const x of [-1.5, -.95]) {
    addBeam('command external cables', darkMaterial, new THREE.Vector3(x, 3.5, -7.57), new THREE.Vector3(x + .3, 6.46, -8.0), .065);
    for (let j = 0; j < 12; j++) addTiltedBox('command cable brackets', titaniumMaterial, [x + j * .025, 3.63 + j * .235, -7.59 - j * .035], [.22, .055, .13], [0, 0, -.1]);
  }
  for (let j = 0; j < 5; j++) {
    addTiltedBox('command cheek armour', metalMaterial, [1.45, 4.72 + j * .24, -9.38], [.12, .16, .68], [0, 0, .13], new THREE.Color(.44, .47, .49));
    addBox('command service compressors', darkMaterial, -2.38, 3.5, -8.9 + j * .4, .44, .57, .27);
  }
  addBeam('command lattice tower', titaniumMaterial, new THREE.Vector3(1.35, 3.1, -10.8), new THREE.Vector3(1.6, 7.5, -10.8), .07);
  addBeam('command lattice tower', titaniumMaterial, new THREE.Vector3(1.95, 3.1, -10.8), new THREE.Vector3(1.6, 7.5, -10.8), .07);
  for (let j = 0; j < 8; j++) addBeam('command lattice braces', titaniumMaterial, new THREE.Vector3(1.35 + j * .028, 3.3 + j * .5, -10.8), new THREE.Vector3(1.95 - (j + 1) * .039, 3.8 + j * .5, -10.8), .028);
  const antennaPositions = [[-.47, 7.3, -9.1, 2.45], [.22, 7.3, -9.4, 1.45], [-.66, 7.3, -8.85, 1.75], [1.6, 7.5, -10.8, 1.35], [1.0, 3.3, -16.4, 3.7]];
  const beacons = [];
  for (const [x, y, z, h] of antennaPositions) {
    addBeam('antenna masts', titaniumMaterial, new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h, z), .035);
    addBox('antenna bases', darkMaterial, x, y + .15, z, .28, .3, .28);
    beacons.push({ x, y: y + h, z, phase: rnd() * TAU });
  }
  for (const { mid, index } of sectors) if (index % 3 === 0) {
    const p = v(13.25, 2.1, mid), h = .7 + rnd() * .8;
    addBeam('antenna masts', titaniumMaterial, p, p.clone().add(new THREE.Vector3(0, h, 0)), .025);
    beacons.push({ x: p.x, y: p.y + h, z: p.z, phase: rnd() * TAU });
    // Narrow maintenance railing and isolated rooftop pipe runs.
    addBeam('roof pipes', bronzeMaterial, v(10.2, 2.36, mid - .047), v(12.7, 2.36, mid - .047), .04);
    addBeam('roof pipes', titaniumMaterial, v(10.2, 2.39, mid - .065), v(12.7, 2.39, mid - .065), .032);
  }

  // Radiator wings use real ribs and cells, with front/back metal frames.
  for (const side of [-1, 1]) {
    const x = side * 16.0, z = -4.3;
    addBeam('radiator supports', titaniumMaterial, new THREE.Vector3(side * 12.6, .1, z), new THREE.Vector3(side * 18.7, .1, z), .11);
    for (const local of [-1, 1]) {
      const centerX = x + side * local * 1.54;
      addBox('radiator panels', radiatorMaterial, centerX, .21, z, 2.72, .12, 7.8);
      for (let c = 0; c < 7; c++) for (let r = 0; r < 19; r++) addBox('radiator cells', metalMaterial, centerX - 1.17 + c * .39, .29, z - 3.55 + r * .39, .355, .015, .355, 0, new THREE.Color(.055 + rnd() * .025, .105 + rnd() * .02, .16 + rnd() * .025));
      for (const edge of [-1, 1]) addBox('radiator frames', titaniumMaterial, centerX + edge * 1.39, .27, z, .07, .16, 7.92);
      for (const edge of [-1, 1]) addBox('radiator frames', titaniumMaterial, centerX, .27, z + edge * 3.94, 2.85, .16, .07);
    }
  }
  // Aft service gantries and antenna dishes break the axial silhouette.
  for (const side of [-1, 1]) {
    addBox('aft spars', darkMaterial, side * 1.65, 1, -22.5, .28, .55, 4.0);
    addBox('aft spar plating', titaniumMaterial, side * 1.65, 1.32, -22.5, .42, .09, 3.5);
    addBox('aft terminal lights', windowMaterial, side * 1.65, 1.38, -24.1, .23, .03, .14, 0, new THREE.Color(1.3, .5, .15));
  }
  for (const [x, z, size] of [[-2.8, -12, .72], [2.6, -6, .52], [-1.3, -17.5, .48]]) {
    const dish = mesh(new THREE.SphereGeometry(size, 16, 8, 0, TAU, 0, Math.PI * .38), titaniumMaterial);
    dish.position.set(x, 3.1, z); dish.rotation.z = .42;
    addBeam('dish arms', darkMaterial, new THREE.Vector3(x, 1.5, z), new THREE.Vector3(x, 3.0, z), .12);
  }

  // The narrow inner transfer ring rotates independently of the inhabited hull.
  const rotor = new THREE.Group(); rotor.name = 'Rotating transfer track'; group.add(rotor);
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU, next = (i + 1) / 48 * TAU;
    addBeam('rotor outer rails', titaniumMaterial, v(7.87, -1.05, a), v(7.87, -1.05, next), .055, rotor);
    addBeam('rotor inner rails', darkMaterial, v(7.44, -1.05, a), v(7.44, -1.05, next), .075, rotor);
    if (i % 3 === 0) {
      radialBox('rotor machinery', darkMaterial, 7.66, -.91, a, .68, .3, .53, undefined, rotor);
      radialBox('rotor caps', titaniumMaterial, 7.66, -.72, a, .51, .07, .38, undefined, rotor);
      radialBox('rotor running lights', windowMaterial, 7.42, -.74, a, .18, .045, .03, new THREE.Color(.27, 1.05, 1.25), rotor);
    }
  }

  // Real instanced geometry retains normal lighting and shadows at every scale.
  for (const [name, batch] of batches) {
    const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.entries.length);
    instances.name = name;
    for (let i = 0; i < batch.entries.length; i++) { instances.setMatrixAt(i, batch.entries[i].matrix); instances.setColorAt(i, batch.entries[i].color); }
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    instances.castShadow = batch.material !== windowMaterial; instances.receiveShadow = batch.material !== windowMaterial;
    batch.parent.add(instances);
  }
  const windows = new THREE.InstancedMesh(boxGeometry, windowMaterial, windowEntries.length);
  windows.name = 'Independently occupied windows';
  for (let i = 0; i < windowEntries.length; i++) { windows.setMatrixAt(i, windowEntries[i]); windows.setColorAt(i, color.copy(windowData[i].tint).multiplyScalar(windowData[i].value)); }
  windows.instanceColor.setUsage(THREE.DynamicDrawUsage); group.add(windows);
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 6, 4), windowMaterial, beacons.length);
  beaconMesh.name = 'Navigation marker lamps';
  for (let i = 0; i < beacons.length; i++) {
    const b = beacons[i]; matrix.makeTranslation(b.x, b.y, b.z); beaconMesh.setMatrixAt(i, matrix); beaconMesh.setColorAt(i, new THREE.Color(3, .08, .025));
  }
  group.add(beaconMesh);
  let previous = 0, rotorAngle = 0;
  function update(time, activity = 1) {
    const dt = Math.max(0, Math.min(.1, time - previous)); previous = time;
    rotorAngle += dt * .016 * Math.max(.15, activity);
    rotor.rotation.y = rotorAngle;
    for (let i = 0; i < windowData.length; i++) {
      const w = windowData[i];
      if (time >= w.next) { w.target = w.target > .5 ? .013 : 1; w.next = time + w.period * (.6 + rnd() * .8); }
      w.value += (w.target - w.value) * (1 - Math.exp(-dt * 2));
      windows.setColorAt(i, color.copy(w.tint).multiplyScalar(w.value));
    }
    windows.instanceColor.needsUpdate = true;
    for (let i = 0; i < beacons.length; i++) {
      const pulse = Math.pow(Math.max(0, Math.sin(time * 1.2 + beacons[i].phase)), 12);
      beaconMesh.setColorAt(i, color.setRGB(1 + pulse * 5, .025 + pulse * .08, .015));
    }
    beaconMesh.instanceColor.needsUpdate = true;
  }
  group.userData.description = 'Sectioned pressure ring, axial service spine, open trusses, layered armour, inhabited decks, radiator wings, command citadel and moving transfer track.';
  group.userData.windowCount = windowEntries.length;
  return { group, update, windows, lights: [], rotor, windowCount: windowEntries.length };
}
