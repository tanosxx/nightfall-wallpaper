import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url),window={};
const context=vm.createContext({window,Math,Number,Error});
for(const name of ['junction-data.js','junction-atmosphere.js'])
  vm.runInContext(fs.readFileSync(new URL(name,root),'utf8'),context,{filename:name});
const data=window.JUNCTION_DATA,weather=window.JUNCTION_ATMOSPHERE;

// The generated image's foreground rail is curved: each measured survey point
// has to be reached, with no jump in train height or tangent at a segment join.
for(const route of data.routes){
  const first=route.points[0],last=route.points.at(-1);
  for(const [x,y] of route.points){
    const u=(x-first[0])/(last[0]-first[0]),p=data.routeAt(route.id,u);
    assert.ok(Math.abs(p.x-x)<1e-7&&Math.abs(p.y-y)<1e-7);
    if(u>0&&u<1){
      const before=data.routeAt(route.id,u-1e-7),after=data.routeAt(route.id,u+1e-7);
      assert.ok(Math.abs(before.tangent-after.tangent)<1e-5);
      assert.ok(Math.abs(before.scale-after.scale)<1e-5);
    }
  }
  let previousY=first[1]-1;
  for(let i=0;i<=1000;i++){
    const p=data.routeAt(route.id,i/1000);
    assert.ok(p.y>=previousY&&p.halfGauge>0&&p.height>0);previousY=p.y;
  }
}
assert.equal(new Set(data.signals.map(s=>s.id)).size,8);
assert.ok(data.signals.every(s=>s.base[1]>s.y));

// Steam is spawned at the existing vents, travels consistently upwards, and
// fades before it recycles. Seeking or tab suspension cannot shift its phase.
for(let v=0;v<weather.steamSources.length;v++)for(let i=0;i<10;i++){
  const p=weather.steamAt(v,i,200),same=weather.steamAt(v,i,200);
  assert.deepEqual(p,same);
  const later=weather.steamAt(v,i,200.01);
  if(later.u>p.u){assert.ok(later.y<p.y);assert.ok(later.x>p.x);}
  const reset=200+p.life-p.age;
  assert.ok(weather.steamAt(v,i,reset-.0001).alpha<1e-6);
  assert.ok(weather.steamAt(v,i,reset+.0001).alpha<1e-6);
  assert.ok(p.x>=weather.steamSources[v].x-3&&p.y<=weather.steamSources[v].y);
}
for(let i=0;i<data.neon.length;i++){
  let darkest=1,brightest=0;
  for(let t=0;t<20;t+=.05){const p=weather.neonAt(i,t).brightness;
    assert.ok(p>=0&&p<=1);darkest=Math.min(darkest,p);brightest=Math.max(brightest,p);}
  assert.ok(darkest<.15&&brightest===1,'Every neon bank visibly dims and returns within the preview.');
}
assert.ok(weather.neonAt(0,1.2).brightness<.2&&weather.neonAt(1,1.2).brightness===1,
  'Adjacent neon banks do not share a simultaneous blink.');
for(let i=0;i<weather.drops.length;i++)for(const t of [0,30,36000]){
  const p=weather.rainAt(i,t);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.ok(p.x>=-15&&p.x<=data.W+20&&p.y>=-20&&p.y<=data.H+15);
}
console.log('PASS: measured tracks, smooth rail tangent, trackside signals, advected steam, independent neon, rain bounds');
