(function () {
"use strict";
/* Nightfall V4 shared simulation. No browser or GNOME dependencies. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => v * v * (3 - 2 * v);

function seedNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const text = String(value === undefined ? Date.now() + Math.random() : value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function createSimulation(data, seed) {
  let randomState = seedNumber(seed), serial = 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const choose = values => values[Math.floor(random() * values.length)];
  const imageWidth = data.IMAGE_WIDTH || 1672;
  const sim = {time: 0, wind: -.08, windOffset: 0, vehicles: [], windows: [], impacts: [], smoke: []};
  const routes = (data.TRAFFIC || []).map((route, index) => ({
    route, index, max: clamp(Math.round(route.count || 5), 1, 24),
    nextSpawn: between(.25, 2.2), period: Math.max(5, route.period || 30),
  }));
  const waters = (data.WATER || []).map((water, index) => ({water, index})).filter(({water}) => water.polygon && water.polygon.length >= 3).map(({water, index}) => ({
    water, index, nextSpawn: between(.01, .12),
    minX: Math.min(...water.polygon.map(p => p[0])), maxX: Math.max(...water.polygon.map(p => p[0])),
    minY: Math.min(...water.polygon.map(p => p[1])), maxY: Math.max(...water.polygon.map(p => p[1])),
  }));
  const emitters = (data.SMOKE || []).map((emitter, index) => ({emitter, index, nextSpawn: between(.05, .8)}));

  function spawnVehicle(state, initial = false) {
    const route = state.route;
    const twoWay = route.twoWay !== false && route.bidirectional !== false && !route.direction;
    const direction = route.direction === -1 ? -1 : route.direction === 1 ? 1 : twoWay && random() < .45 ? -1 : 1;
    const progress = initial ? between(.08, .92) : direction > 0 ? 0 : 1;
    const lane = twoWay ? direction * (route.laneWidth === undefined ? .75 : route.laneWidth / 2) : 0;
    // A new vehicle waits for room at its entrance; independent arrivals cannot form a stack.
    if (sim.vehicles.some(v => v.routeIndex === state.index && v.direction === direction && Math.abs(v.progress - progress) < .035)) return false;
    let color;
    if (direction < 0) color = choose([[255, 121, 68], [255, 150, 87], [255, 178, 107]]);
    else color = random() < .55 ? (route.color || [194, 234, 249]) : choose([[222, 244, 255], [168, 222, 247], [255, 217, 161]]);
    const speed = between(.65, 1.65) / state.period;
    const vehicle = {
      id: ++serial, routeIndex: state.index, progress, direction, lane, color,
      speed: clamp(speed, route.minSpeed || .004, route.maxSpeed || .15),
      length: between(1.4, 4.5), alpha: initial ? between(.65, 1) : 0,
      intensity: between(.68, 1), age: initial ? between(2, 12) : 0,
    };
    sim.vehicles.push(vehicle);
    return true;
  }

  for (const state of routes) {
    const count = Math.max(1, Math.floor(state.max * between(.42, .72)));
    for (let i = 0; i < count; i++) spawnVehicle(state, true);
  }

  (data.LIGHTS || []).forEach(raw => {
    const light = Array.isArray(raw) ? {color: raw[4], kind: raw[7]} : raw;
    const neon = light.kind === 'neon';
    const on = random() < (neon ? .94 : .63);
    const value = on ? between(neon ? .76 : .8, 1) : 0;
    sim.windows.push({
      brightness: value, on, nextChange: neon ? between(.15, 12) : between(1, 8),
      color: light.color || (neon ? [100, 226, 255] : [255, 185, 100]),
      target: value, from: value, fadeStart: 0, fadeDuration: between(.08, .2), neon,
    });
  });

  function updatePuff(puff) {
    const f = clamp(puff.age / puff.life, 0, 1);
    puff.radius = puff.startRadius + (puff.endRadius - puff.startRadius) * Math.pow(f, .75);
    puff.alpha = puff.opacity * Math.min(1, puff.age / .7) * Math.pow(Math.max(0, 1 - f), .72);
    puff.rotation = puff.phase + puff.age * puff.spin;
  }

  function spawnSmoke(state, initial = false) {
    const emitter = state.emitter;
    if (sim.smoke.length >= 210 || sim.smoke.filter(p => p.emitterIndex === state.index).length >= 30) return;
    const life = between(8, 18), age = initial ? between(.6, life * .88) : 0;
    const spread = emitter.spread || .028;
    const rise = emitter.rise || .12;
    const drift = between(-.0013, .0018);
    const puff = {
      id: ++serial, emitterIndex: state.index, age, life,
      x: emitter.x + between(-spread * .08, spread * .08) + drift * age,
      y: emitter.y - rise * age / life,
      vx: drift, vy: rise / life, phase: between(0, Math.PI * 2), spin: between(-.08, .08),
      startRadius: Math.max(3, spread * imageWidth * between(.1, .2)),
      endRadius: Math.max(15, spread * imageWidth * between(.8, 1.45)),
      opacity: (emitter.opacity || .60) * between(.78, 1.08),
      color: emitter.color || [105, 129, 145], radius: 0, alpha: 0, rotation: 0,
    };
    updatePuff(puff);
    sim.smoke.push(puff);
  }

  for (const state of emitters) {
    const count = clamp(Math.round((state.emitter.rate || 1.4) * 7), 5, 20);
    for (let i = 0; i < count; i++) spawnSmoke(state, true);
  }

  function spawnImpact(state) {
    if (sim.impacts.length >= 240) return;
    let x, y, found = false;
    for (let tries = 0; tries < 40; tries++) {
      x = between(state.minX, state.maxX); y = between(state.minY, state.maxY);
      if (insidePolygon(x, y, state.water.polygon)) {found = true; break;}
    }
    if (!found) return;
    const scale = (state.water.scale || 1) * between(.7, 1.3);
    const dropDuration = between(.09, .19);
    sim.impacts.push({
      id: ++serial, waterIndex: state.index, x, y, age: 0,
      life: dropDuration + between(.55, 1.35), dropDuration, scale,
      dropHeight: between(16, 38) * scale,
      phase: 'drop', radius: 0, alpha: between(.65, .95),
      strength: between(.7, 1), maxRadius: between(8, 17) * scale,
    });
  }

  sim.step = (dt, pointer = {}, rain = .7) => {
    // Suspended sessions do not replay a backlog; calling with zero is a true pause.
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .25);
    if (!dt) return sim;
    rain = clamp(Number.isFinite(rain) ? rain : .7, 0, 1);
    sim.time += dt;
    // A mild continuous leftward breeze; cursor input never affects the scene.
    const targetWind = -.08 + .012 * Math.sin(sim.time * .075);
    sim.wind += (targetWind - sim.wind) * (1 - Math.exp(-dt * 2));
    sim.windOffset += sim.wind * dt * .075;

    for (const window of sim.windows) {
      if (sim.time >= window.nextChange) {
        window.on = !window.on;
        window.from = window.brightness;
        window.target = window.on ? between(window.neon ? .72 : .78, 1) : 0;
        window.fadeStart = sim.time;
        window.fadeDuration = window.neon ? between(.04, .13) : between(.08, .2);
        const hold = window.neon ? (window.on ? between(3, 22) : between(.08, .5)) : between(4, 35);
        window.nextChange = sim.time + window.fadeDuration + hold;
      }
      const f = smooth(clamp((sim.time - window.fadeStart) / window.fadeDuration, 0, 1));
      window.brightness = window.from + (window.target - window.from) * f;
    }

    for (let i = sim.vehicles.length - 1; i >= 0; i--) {
      const vehicle = sim.vehicles[i];
      vehicle.age += dt;
      vehicle.progress += vehicle.speed * vehicle.direction * dt;
      if (vehicle.progress < 0 || vehicle.progress > 1) {sim.vehicles.splice(i, 1); continue;}
      vehicle.alpha = Math.min(1, vehicle.progress * 24, (1 - vehicle.progress) * 24) * vehicle.intensity;
    }
    for (const state of routes) {
      state.nextSpawn -= dt;
      if (state.nextSpawn <= 0) {
        const count = sim.vehicles.filter(v => v.routeIndex === state.index).length;
        if (count < state.max) spawnVehicle(state);
        // Renew the headway each time: short arrivals, empty stretches, and no repeating procession.
        state.nextSpawn = (state.period / state.max) * (random() < .2 ? between(.16, .5) : between(.6, 2.15));
      }
    }

    for (let i = sim.impacts.length - 1; i >= 0; i--) {
      const impact = sim.impacts[i]; impact.age += dt;
      if (impact.age >= impact.life) {sim.impacts.splice(i, 1); continue;}
      if (impact.age < impact.dropDuration) {
        impact.phase = 'drop'; impact.alpha = impact.strength;
      } else {
        impact.phase = 'ripple';
        const f = (impact.age - impact.dropDuration) / (impact.life - impact.dropDuration);
        impact.radius = .8 + impact.maxRadius * f;
        impact.alpha = impact.strength * Math.pow(1 - f, 1.25);
      }
    }
    if (rain > 0) for (const state of waters) {
      const rate = clamp(state.water.rate || 18, .1, 100) * rain;
      state.nextSpawn -= dt;
      let spawned = 0;
      while (state.nextSpawn <= 0 && spawned++ < 30) {
        spawnImpact(state);
        // Exponential arrivals make impacts independent rather than a clocked pattern.
        state.nextSpawn += Math.max(.004, -Math.log(Math.max(.0001, random())) / rate);
      }
    }

    for (let i = sim.smoke.length - 1; i >= 0; i--) {
      const puff = sim.smoke[i]; puff.age += dt;
      if (puff.age >= puff.life) {sim.smoke.splice(i, 1); continue;}
      puff.x += (puff.vx + sim.wind * .005 + Math.sin(puff.age * .7 + puff.phase) * .0009) * dt;
      puff.y -= puff.vy * dt;
      updatePuff(puff);
    }
    for (const state of emitters) {
      state.nextSpawn -= dt;
      if (state.nextSpawn <= 0) {
        spawnSmoke(state);
        state.nextSpawn += between(.65, 1.35) / clamp(state.emitter.rate || 1.4, .15, 6);
      }
    }
    return sim;
  };
  return sim;
}

window.createNightfallSimulation=createSimulation;
})();
