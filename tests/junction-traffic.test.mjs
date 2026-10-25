import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={window:{}};
vm.runInNewContext(await readFile(new URL('../junction-traffic.js',import.meta.url),'utf8'),scope);
const {routes,sample,routePoint,inside}=scope.window.JUNCTION_TRAFFIC;
assert.equal(routes.length,8);
const initial=sample(0).filter(car=>car.visible);
assert(initial.length>=30,'The first frame already shows an active city');
assert(initial.some(car=>car.y>900&&car.direction===1)&&initial.some(car=>car.y>900&&car.direction===-1),
  'The actual street below the foreground bridge starts with both directions visible');
assert(new Set(initial.map(car=>car.colourName)).size>=4,'Initial traffic is visibly multicoloured');
for(const invalid of [-1,NaN,Infinity])assert.equal(JSON.stringify(sample(invalid)),JSON.stringify(sample(0)));

const directions=new Map(routes.map(route=>[route.id,new Set()])),hidden=new Set(),gaps=new Map();
const colours=new Set(),intensities=new Set(),speeds=new Set(),counts=new Map(),measuredSpeeds=[];
let previous=new Map(),observed=0,lowerObserved=0;
for(let time=0;time<180;time+=.05){
  const cars=sample(time),snapshot=JSON.stringify(cars);sample(time+1000);
  assert.equal(JSON.stringify(sample(time)),snapshot,'Seeking does not change paused traffic');
  const current=new Map();
  for(const car of cars){
    current.set(car.id,car);directions.get(car.route).add(car.direction);
    const route=routes.find(route=>route.id===car.route),center=routePoint(route,car.u);
    assert([car.x,car.y,car.scale,car.length,car.width,car.opacity,car.trail].every(Number.isFinite));
    assert(car.length>1.5&&car.length<10&&car.width<3.3,'Cars retain their photographed perspective scale');
    assert(Math.hypot(car.x-center.x,car.y-center.y)<=route.lane+1e-8,'Vehicles stay on their measured lane');
    assert(car.opacity>=0&&car.opacity<=1);
    assert(car.x>=630&&car.x<=1320,'Vehicles stay inside real service-road regions');
    if(car.y>565){
      assert.equal(car.route,'underdeck-street','No traffic crosses the vast vertical foreground walls');
      assert(car.x>730&&car.x<746&&car.y>=905&&car.y<947,'Lower traffic is confined to the real bridge opening');
    }
    assert(car.glowRadius>=4.4&&car.glowRadius<=6,'Readable first-city-sized light halo');
    assert(car.trail>=2&&car.trail<10,'Short directional trails are visible without spanning buildings');
    assert.equal(car.color.length,3);
    const blocked=route.occlusion.some(shape=>inside(car,shape));
    if(blocked){assert.equal(car.visible,false);hidden.add(car.route);}
    if(car.y>=941)assert.equal(car.visible,false,'Diagnostics exclude vehicles already below the frame');
    if(car.visible){observed++;if(car.y>900)lowerObserved++;}
    const before=previous.get(car.id);
    if(before){
      const displacement=Math.hypot(car.x-before.x,car.y-before.y);
      assert(displacement<1.2,'Speed changes and following never teleport a car');
      assert(Math.abs(car.opacity-before.opacity)<.22,'Vehicles fade rather than pop at road entrances');
      assert((car.u-before.u)*car.direction>=-1e-10,'Following another car never makes a vehicle reverse');
      if(car.route==='distant-crossing'&&car.opacity>.95)measuredSpeeds.push(displacement/.05);
    }
    const lane=`${car.route}:${car.direction}`;
    if(!gaps.has(lane))gaps.set(lane,new Set());gaps.get(lane).add(car.start);
    colours.add(car.colourName);intensities.add(car.intensity);speeds.add(car.speedFactor);
  }
  for(const [id,a] of current)for(const [other,b] of current){
    if(id>=other||a.route!==b.route||a.direction!==b.direction)continue;
    assert(Math.abs(a.progress-b.progress)>=.0649,'Faster vehicles keep room behind the leader');
  }
  for(const route of routes){
    if(!counts.has(route.id))counts.set(route.id,[]);
    counts.get(route.id).push(cars.filter(car=>car.route===route.id&&car.visible).length);
  }
  previous=current;
}
for(const [route,direction] of directions)assert.equal(direction.size,2,`${route} has both directions`);
assert(hidden.has('distant-crossing')&&hidden.has('central-access')&&hidden.has('station-access')&&hidden.has('west-underpass'),
  'Traffic passes behind measured bridges, gantries and pillars');
let shortIntervals=0,longIntervals=0;
for(const starts of gaps.values()){
  const ordered=[...starts].sort((a,b)=>a-b),intervals=ordered.slice(1).map((t,i)=>t-ordered[i]);
  assert(new Set(intervals.map(n=>Math.round(n*100))).size>=5,'Headways are varied, never a regular procession');
  shortIntervals+=intervals.filter(n=>n>=2&&n<=9).length;
  longIntervals+=intervals.filter(n=>n>18).length;
}
assert(shortIntervals>100&&longIntervals>20,'Short arrivals alternate with genuinely quiet stretches');
assert.deepEqual([...colours].sort(),['blue','purple','red','warm','white']);
assert(intensities.size>=9&&Math.min(...speeds)===.65&&Math.max(...speeds)===1.65,
  'Brightness and free cruise speed vary substantially per car');
assert(Math.max(...measuredSpeeds)/Math.min(...measuredSpeeds)>2,'Different actual travel speeds are visible');
for(const [id,values] of counts)assert(Math.max(...values)-Math.min(...values)>=2,`${id} changes traffic intensity`);
assert(observed>90000&&lowerObserved>8000,'Sustained activity includes the bottom of the frame');
console.log('PASS: eight source-aligned corridors, visible lower bidirectional traffic, five colours, varied speed/intensity/headways, safe following, first-city-sized light treatment and measured occlusion.');
