import {FLOW_ASSET_FILES,drawSmokeFlow} from './titans-smoke-flow.js';
// Photographic fire, rising soot and tiny salvage work on the broken titans.
// One time-only model is shared by the browser and native Cairo wallpaper.
export const GROUND_ASSET_FILES = Object.freeze({
  ...FLOW_ASSET_FILES,
  flames: 'ground-flames.png',
  smoke: 'ground-smoke.png',
  emission: 'ground-emission.png',
});
const TAU = Math.PI * 2;
const clamp = v => Math.max(0, Math.min(1, v));
const fract = v => v - Math.floor(v);
const hash = v => fract(Math.sin(v * 127.1 + 311.7) * 43758.5453);
const smooth = v => {v = clamp(v); return v * v * (3 - 2 * v);};
const saneTime = t => Number.isFinite(t) ? Math.max(0, t) : 0;
const saneIntensity = v => v === undefined ? 1 : (Number.isFinite(v) ? clamp(v) : 0);
function noise(t, seed) {
  const i = Math.floor(t), f = smooth(fract(t));
  return hash(i + seed) * (1 - f) + hash(i + 1 + seed) * f;
}

// x/y are photographed flame roots, not free-floating lights. The distant
// fires remain sub-pixel to a few pixels high; only the foreground is tall.
export const FIRE_SOURCES = Object.freeze([
  {x: 1371, y: 319, w: 5.13, h: 7.92, depth: .18},
  {x: 1456, y: 325, w: 4.05, h: 7.00, depth: .18},
  {x: 945, y: 366, w: 4.32, h: 8.45, depth: .22},
  {x: 585, y: 326, w: 14.78, h: 43.47, depth: .58},
  {x: 601, y: 333, w: 8.87, h: 22.77, depth: .55},
  {x: 376, y: 386, w: 14.78, h: 41.40, depth: .63},
  {x: 391, y: 389, w: 7.39, h: 24.84, depth: .63},
  {x: 39, y: 416, w: 7.16, h: 17.16, depth: .4},
  {x: 1267, y: 489, w: 5.40, h: 13.73, depth: .39},
  {x: 1392, y: 503, w: 5.40, h: 12.14, depth: .42},
  {x: 1324, y: 505, w: 9.45, h: 20.33, depth: .42},
  {x: 1365, y: 503, w: 8.23, h: 17.42, depth: .42},
  {x: 579, y: 491, w: 15.70, h: 40.16, depth: .62},
  {x: 601, y: 495, w: 9.61, h: 24.63, depth: .62},
  {x: 451, y: 497, w: 7.20, h: 21.53, depth: .55},
  {x: 1625, y: 536, w: 6.35, h: 17.69, depth: .43},
  {x: 1656, y: 538, w: 8.23, h: 18.48, depth: .43},
  {x: 1485, y: 545, w: 5.40, h: 10.69, depth: .45},
  {x: 632, y: 560, w: 13.87, h: 34.15, depth: .69},
  {x: 650, y: 565, w: 7.02, h: 19.25, depth: .69},
  {x: 562, y: 630, w: 11.27, h: 32.71, depth: .77},
  {x: 1159, y: 638, w: 9.61, h: 26.70, depth: .7},
  {x: 1294, y: 637, w: 7.57, h: 18.22, depth: .63},
  {x: 1397, y: 681, w: 7.76, h: 21.11, depth: .7},
  {x: 936, y: 735, w: 20.93, h: 64.60, depth: 1},
  {x: 955, y: 741, w: 28.53, h: 86.13, depth: 1},
  {x: 974, y: 746, w: 24.39, h: 71.77, depth: 1},
  {x: 993, y: 749, w: 16.79, h: 47.85, depth: 1},
  {x: 1027, y: 750, w: 14.73, h: 38.28, depth: 1},
  {x: 1512, y: 812, w: 20.48, h: 50.24, depth: .95},
  {x: 1543, y: 816, w: 14.73, h: 33.50, depth: .95},
].map(Object.freeze));
const EMISSION_REGIONS = [
  [925,690,117,71], [542,465,83,45], [354,351,52,50], [551,292,66,50],
  [615,534,53,39], [533,607,46,32], [1230,472,190,50], [1590,511,82,41],
  [1495,795,83,33], [1447,531,83,24], [1376,666,33,25], [1264,621,54,25],
  [28,393,32,38], [1343,303,130,31], [922,349,42,28], [1141,617,34,29],
];
export const SMOKE_SOURCES = Object.freeze([
  {x: 1449, y: 319, rise: 2.0, wind: -.45, size: 3.8, growth: .85, life: 12, step: .76, alpha: .35},
  {x: 945, y: 362, rise: 2.6, wind: -.48, size: 3.4, growth: .85, life: 11, step: .76, alpha: .33},
  {x: 584, y: 321, rise: 4.4, wind: -.65, size: 4.7, growth: 1.35, life: 9, step: .61, alpha: .24},
  {x: 376, y: 383, rise: 4.2, wind: -.65, size: 5.7, growth: 1.2, life: 11, step: .58, alpha: .23},
  {x: 1365, y: 500, rise: 3.3, wind: -.95, size: 6.5, growth: 1.5, life: 15, step: .63, alpha: .26},
  {x: 1637, y: 533, rise: 7.0, wind: -1.2, size: 7.7, growth: 1.85, life: 17, step: .66, alpha: .31},
  {x: 584, y: 488, rise: 4.3, wind: -.78, size: 7.7, growth: 1.55, life: 12, step: .57, alpha: .25},
  {x: 633, y: 556, rise: 4.3, wind: -.75, size: 4.8, growth: 1.1, life: 10, step: .57, alpha: .24},
  {x: 559, y: 628, rise: 5.8, wind: -1.35, size: 4.7, growth: 1.3, life: 9, step: .53, alpha: .24},
  {x: 960, y: 730, rise: 9.8, wind: -6.0, size: 10, growth: 2.3, life: 14, step: .46, alpha: .29},
  {x: 1521, y: 808, rise: 6.3, wind: -1.7, size: 5.7, growth: 1.5, life: 11, step: .56, alpha: .22},
].map(Object.freeze));
export const SALVAGE_SITES = Object.freeze([
  {x: 497, y: 209, scale: .54, period: 17.7, phase: 4.3},
  {x: 565, y: 269, scale: .57, period: 21.3, phase: 11.7},
  {x: 619, y: 315, scale: .62, period: 14.9, phase: 1.2},
  {x: 710, y: 269, scale: .50, period: 24.1, phase: 14.8},
  {x: 744, y: 389, scale: .69, period: 18.2, phase: 7.1},
  {x: 788, y: 456, scale: .73, period: 22.7, phase: 3.2},
  {x: 542, y: 438, scale: .66, period: 16.3, phase: 8.4},
  {x: 1262, y: 405, scale: .39, period: 19.4, phase: 2.1},
  {x: 1342, y: 416, scale: .42, period: 23.8, phase: 13.0},
  {x: 1422, y: 461, scale: .44, period: 15.8, phase: 5.2},
  {x: 1218, y: 474, scale: .42, period: 27.1, phase: 17.3},
  {x: 1550, y: 349, scale: .23, period: 25.6, phase: 4.3},
].map(Object.freeze));

export function smokeSamples(time, intensity = 1) {
  const t = saneTime(time), activity = saneIntensity(intensity);
  if (!activity) return [];
  const result = [];
  SMOKE_SOURCES.forEach((s, source) => {
    const offset = source * 2.731, local = t + offset;
    const step = s.step * 1.45;
    const last = Math.floor(local / step);
    for (let born = Math.ceil((local - s.life) / step); born <= last; born++) {
      const seed = born + source * 227, age = local - born * step;
      const lifetime = s.life * (.8 + .2 * hash(seed + 4));
      if (age < 0 || age >= lifetime) continue;
      const fraction = age / lifetime;
      const swelling = s.size + age * s.growth;
      const envelope = smooth(age / 1.1) * (1 - smooth((fraction - .5) / .5));
      result.push({source, born, age, texture: Math.floor(hash(seed + 61) * 6),
        x: s.x + s.wind * age + Math.sin(age * .35 + hash(seed + 91) * TAU) * age * .34,
        y: s.y - age * s.rise * (.84 + hash(seed + 35) * .32),
        radius: swelling, angle: hash(seed + 81) * TAU + age * .025 * (hash(seed + 5) - .5),
        alpha: s.alpha * 2.8 * envelope * (.8 + .2 * hash(seed + 11)) * activity,
      });
    }
  });
  // Older particles are behind newly emitted soot at each source.
  result.sort((a, b) => SMOKE_SOURCES[a.source].y - SMOKE_SOURCES[b.source].y || b.age - a.age);
  return result;
}

export function salvageState(siteIndex, time, intensity = 1) {
  const s = SALVAGE_SITES[siteIndex], t = saneTime(time), activity = saneIntensity(intensity);
  if (!s) return {lamp: 0, weld: 0, phase: 0, cycle: 0};
  const local = t + s.phase, cycle = Math.floor(local / s.period), phase = local - cycle * s.period;
  const seed = siteIndex * 199 + cycle;
  const workLength = 6.4 + hash(seed + 1) * 6.1;
  const lamp = smooth(phase / .6) * (1 - smooth((phase - workLength) / 1.1)) * (.68 + .24 * noise(t * .7, seed + 12)) * activity;
  let weld = 0;
  if (phase > 1.0 && phase < workLength - 1 && hash(seed + 51) > .16) {
    // Irregular clusters with rests within one repair job, not a blinking sine.
    const on = noise(t * 1.7, siteIndex * 39) > .43;
    if (on) weld = (.34 + .66 * hash(Math.floor(t * 24) + siteIndex * 131)) * activity;
  }
  return {lamp, weld, phase, cycle};
}

function glow(ctx, x, y, radius, center, edge, alpha) {
  if (alpha <= .001) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, center); gradient.addColorStop(.22, edge); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha; ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function createGroundEffects(assets) {
  for (const key of Object.keys(GROUND_ASSET_FILES)) {
    if (!assets[key]) throw new Error(`Missing titans ground asset: ${key}`);
  }
  function render(ctx, time, intensity = 1) {
    const t = saneTime(time), activity = saneIntensity(intensity);
    if (!activity) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // The photograph's orange fragments illuminate with independent fuel cycles.
    EMISSION_REGIONS.forEach(([x,y,w,h], i) => {
      ctx.globalAlpha = (.15 + .32 * noise(t * 1.8, 70 + i * 17)) * activity;
      ctx.drawImage(assets.emission, x,y,w,h, x,y,w,h);
    });
    const fireActivity = Math.sqrt(activity);
    FIRE_SOURCES.forEach((s, i) => {
      const turbulence = noise(t * 3.1, i * 79);
      const height = s.h * (.48 + .89 * turbulence);
      const width = s.w * (.80 + .30 * noise(t * 2.4, i * 41));
      const x = s.x + (noise(t * 3.6, 300 + i) - .5) * s.depth * 3.4;
      const position = ((t * (10.3 + hash(i) * 5.1) + i * 5.38) % 24 + 24) % 24;
      const frame = Math.floor(position), mix = fract(position), next = (frame + 1) % 24;
      // Dense flame cores visibly replace their own changing outline. Screen
      // alone washes them out against the white-hot fire already in the photo.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fireActivity * (.90 + .10 * turbulence) * (1 - mix);
      ctx.drawImage(assets.flames, frame % 8 * 80, Math.floor(frame / 8) * 128, 80,128, x-width/2,s.y-height,width,height);
      ctx.globalAlpha = fireActivity * (.90 + .10 * turbulence) * mix;
      ctx.drawImage(assets.flames, next % 8 * 80, Math.floor(next / 8) * 128, 80,128, x-width/2,s.y-height,width,height);
      ctx.globalCompositeOperation = 'screen';
      glow(ctx,s.x,s.y-2,s.h*.72,'rgba(255,161,57,.34)','rgba(211,79,18,.14)',fireActivity*(.48+.45*turbulence));
    });
    drawSmokeFlow(ctx,assets,t,activity);
    ctx.globalCompositeOperation = 'source-over';
    for (const p of smokeSamples(t,activity)) {
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(assets.smoke,p.texture%3*160,Math.floor(p.texture/3)*160,160,160,-p.radius,-p.radius,p.radius*2,p.radius*2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'screen';
    SALVAGE_SITES.forEach((s,i) => {
      const state = salvageState(i,t,activity), r = s.scale;
      // A work lamp lights a small patch on the damaged hull, with a tight core.
      glow(ctx,s.x,s.y,17*r,'rgba(255,201,133,.28)','rgba(208,135,62,.10)',state.lamp);
      glow(ctx,s.x,s.y,3*r,'rgba(255,236,177,1)','rgba(255,180,77,.48)',state.lamp);
      if(state.weld>.01) {
        glow(ctx,s.x+1.8*r,s.y-1.1*r,23*r,'rgba(190,224,255,.67)','rgba(73,159,255,.13)',state.weld);
        glow(ctx,s.x+1.8*r,s.y-1.1*r,5*r,'rgba(249,253,255,1)','rgba(139,206,255,.85)',state.weld);
        ctx.globalAlpha=state.weld;ctx.fillStyle='#f8fdff';ctx.fillRect(s.x+1*r,s.y-1.7*r,1.5*r,.9*r);
      }
      // Sparks are emitted only while the deterministic earlier arc was active.
      const step=.10, newest=Math.floor(t/step);
      for(let born=newest-8;born<=newest;born++) {
        const birth=born*step,age=t-birth;
        if(age<0||age>.74||salvageState(i,birth,activity).weld<.44)continue;
        for(let k=0;k<2;k++) {
          const seed=born*5+i*811+k*91, vx=(hash(seed+11)-.5)*20*r,vy=-(3+hash(seed+61)*7)*r;
          const x=s.x+1.8*r+vx*age,y=s.y-1.1*r+vy*age+13*r*age*age;
          const old=Math.max(0,age-.09),px=s.x+1.8*r+vx*old,py=s.y-1.1*r+vy*old+13*r*old*old;
          ctx.globalAlpha=(1-age/.74)*activity*.85;ctx.strokeStyle='#ffd599';ctx.lineWidth=.6*r;
          ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();
        }
      }
    });
    // Small hot embers rise from the nearest fire, diminishing in perspective.
    const emberSources=[FIRE_SOURCES[12],FIRE_SOURCES[25],FIRE_SOURCES[29]];
    emberSources.forEach((s,i)=>{
      const step=.32,newest=Math.floor(t/step);
      for(let born=newest-11;born<=newest;born++){
        const age=t-born*step,seed=born+i*653;
        if(age<0||age>3.4||hash(seed)<.4)continue;
        const x=s.x+(hash(seed+1)-.5)*s.w-age*2*s.depth+Math.sin(age*2+seed)*age*s.depth;
        const y=s.y-4-age*(10+hash(seed+3)*7)*s.depth;
        ctx.globalAlpha=smooth(age/.15)*(1-age/3.4)*activity*.6;
        ctx.fillStyle=hash(seed+4)>.5?'#ffca78':'#ee8c3c';
        ctx.fillRect(x,y,.65*s.depth,1.2*s.depth);
      }
    });
    ctx.restore();
  }
  return {
    render,
    getDiagnostics(time,intensity=1) {
      const t=saneTime(time),activity=saneIntensity(intensity),smoke=smokeSamples(t,activity);
      return {time:t,intensity:activity,fireCount:activity?FIRE_SOURCES.length:0,smoke,
        salvage:SALVAGE_SITES.map((site,i)=>({...site,...salvageState(i,t,activity)})),
        bounds:{width:1672,height:941},alienProtected:true};
    },
  };
}
