import assert from 'node:assert/strict';
import * as Data from '../extension/nightfall@local/polar-data.js';
import {createPolarMotion} from '../polar-motion.js';
const m=createPolarMotion(Data,72819),other=createPolarMotion(Data,72819);
assert.deepEqual(m.windows,other.windows);assert.deepEqual(m.people,other.people);
const initial=m.windows.map(w=>w.on),changed=new Set(),states=m.people.map(()=>new Set()),range={star:[Infinity,-Infinity],beacon:[Infinity,-Infinity]};
let worst=0;
function routeDistance(person,route){let nearest=Infinity;for(let i=1;i<route.length;i++){const [a,b]=[route[i-1],route[i]],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((person.x-a[0])*dx+(person.y-a[1])*dy)/(dx*dx+dy*dy)));nearest=Math.min(nearest,Math.hypot(person.x-a[0]-t*dx,person.y-a[1]-t*dy));}return route.length===1?Math.hypot(person.x-route[0][0],person.y-route[0][1]):nearest;}
for(let frame=0;frame<7200;frame++){
 m.update(1/24);
 m.windows.forEach((w,i)=>{assert(w.value>=0&&w.value<=1);if(w.on!==initial[i])changed.add(i);});
 m.people.forEach((p,i)=>{assert(Number.isFinite(p.x)&&Number.isFinite(p.y));const distance=routeDistance(p,Data.PEOPLE[i].points);worst=Math.max(worst,distance);assert(distance<1e-6);assert(p.face===1||p.face===-1);states[i].add(p.action);});
 Data.STARS.forEach((_,i)=>{const v=m.starBrightness(i);range.star[0]=Math.min(range.star[0],v);range.star[1]=Math.max(range.star[1],v);assert(v>=.82&&v<=1.18);});
 Data.BEACONS.forEach((_,i)=>{const v=m.beaconBrightness(i);range.beacon[0]=Math.min(range.beacon[0],v);range.beacon[1]=Math.max(range.beacon[1],v);assert(v>=.035&&v<=1);});
 if(frame===203)assert.equal(changed.size,Data.WINDOWS.length);
}
for(const actions of states){assert(actions.has('walk'));assert(actions.has('work'));assert([...actions].some(x=>x!=='walk'));}
const before=JSON.stringify({time:m.time,windows:m.windows,people:m.people});m.update(0);assert.equal(JSON.stringify({time:m.time,windows:m.windows,people:m.people}),before);m.update(-1);assert.equal(JSON.stringify({time:m.time,windows:m.windows,people:m.people}),before);
assert(range.beacon[0]<.04&&range.beacon[1]>.99);
console.log(JSON.stringify({duration:m.time,windowsChanged:changed.size,peopleActions:states.map(s=>[...s]),maxRouteError:worst,ranges:range}));console.log('PASS: deterministic seed; all windows switch by8.5s; all people walk/work/pause;300s route bounds; star/beacon bounds; true pause.');
