import assert from 'node:assert/strict';
import * as Data from '../station-data.js';
import {createStationMotion} from '../station-motion.js';
const m=createStationMotion(Data,72819),initial=m.windows.map(w=>w.on),changed=new Set();
assert(!('ships' in m));assert(!('robots' in m));assert.equal(Data.SHIP_ROUTES.length,0);assert.equal(Data.HANGAR.robots.length,0);assert.equal(m.workers.length,4);assert.equal(m.welders.length,2);
const runtime=m.workers, starts=runtime.map(a=>[a.x,a.y]), moved=new Set(),stopped=new Set(),welded=new Set();
function inPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [ax,ay]=points[j],[bx,by]=points[i];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;}return inside;}
const onCounts=[],activitySnapshots=[];let maxSparks=0;
for(let frame=0;frame<7200;frame++){
 m.update(1/24,1);
 m.windows.forEach((w,i)=>{assert(w.value>=0&&w.value<=1);if(w.on!==initial[i])changed.add(i);});
 if(frame<288)onCounts.push(m.windows.filter(w=>w.on).length);
 runtime.forEach((a,i)=>{
  assert([a.x,a.y,a.phase,a.stride,a.progress,a.angle].every(Number.isFinite));assert(a.progress>=0&&a.progress<=1);
  assert(Data.HANGAR.floors.some(p=>inPolygon(a.x,a.y,p)),a.id+' stays on hangar floor');
  assert(inPolygon(a.x,a.y,Data.HANGAR.aperture));
  if(Math.hypot(a.x-starts[i][0],a.y-starts[i][1])>2)moved.add(a.id);
  if(!a.walking&&m.activityTime>4)stopped.add(a.id);
 });
 m.welders.forEach((w,i)=>{if(w.active)welded.add(i);maxSparks=Math.max(maxSparks,w.sparks.length);assert(w.sparks.length<=18);for(const p of w.sparks){assert(p.alpha>=0&&p.alpha<=1);assert(Math.hypot(p.x-w.tool[0],p.y-w.tool[1])<14);}});
 if(frame%240===0)activitySnapshots.push(m.workers.map(a=>`${a.walking}:${a.progress.toFixed(3)}`).join(','));
}
assert.equal(changed.size,Data.STATION_LIGHTS.length);assert.equal(moved.size,runtime.length);assert.equal(stopped.size,runtime.length);assert.equal(welded.size,m.welders.length);
assert(new Set(activitySnapshots).size>20);assert(Math.min(...onCounts)>Data.STATION_LIGHTS.length*.65);
const paused=JSON.stringify(m);m.update(0,1);assert.equal(JSON.stringify(m),paused,'Global pause freezes all state');
m.update(0,0);assert(m.welders.every(w=>!w.active&&w.brightness===0&&w.sparks.every(s=>s.alpha===0)));assert(m.workLights.every(w=>w.brightness===0));
const position=JSON.stringify({workers:m.workers}),activityTime=m.activityTime,globalTime=m.time;
for(let frame=0;frame<480;frame++)m.update(1/24,0);
assert.equal(m.activityTime,activityTime);assert.equal(JSON.stringify({workers:m.workers}),position);assert(m.time>globalTime+19);
m.update(1/24,1);assert(m.activityTime>activityTime);assert(m.workLights.some(w=>w.brightness>0));
console.log(JSON.stringify({workers:m.workers.length,welders:m.welders.length,workLights:m.workLights.length,windowsChanged:changed.size,minOnEarly:Math.min(...onCounts),maxOnEarly:Math.max(...onCounts),maxSparks,moved:[...moved],stopped:[...stopped]}));
console.log('PASS:300s bounded floor routes; all actors move and pause independently; no ships or robots; local welding; all windows change; global pause exact; break freezes activity and extinguishes effects while station lights continue.');
