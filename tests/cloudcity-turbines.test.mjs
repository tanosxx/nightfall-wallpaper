import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={window:{}};
vm.runInNewContext(await readFile(new URL('../cloudcity-turbines.js',import.meta.url),'utf8'),scope);
const {rotors,project,unproject,angle,sample,coverage}=scope.window.CLOUDCITY_TURBINES;
assert.equal(rotors.length,2);
assert(rotors.some(r=>r.cx>450&&r.cx<470&&r.cy>440&&r.cy<455),'Main photographed turbine, not a synthetic fan elsewhere');
assert(rotors.some(r=>r.cx>780&&r.cx<790&&r.cy>415&&r.cy<430),'Distant photographed turbine');
for(const r of rotors){
  assert(Math.abs(r.speed)>=.2&&Math.abs(r.speed)<=.35,'Slow industrial rotation');
  for(let i=0;i<24;i++){
    const theta=i*Math.PI/12,u=Math.cos(theta),v=Math.sin(theta),p=project(r,u,v),q=unproject(r,p.x,p.y);
    assert(Math.abs(q.u-u)<1e-12&&Math.abs(q.v-v)<1e-12,'Texture rectification and screen projection are inverse');
    const turn=angle(r,8),ur=u*Math.cos(turn)-v*Math.sin(turn),vr=u*Math.sin(turn)+v*Math.cos(turn),turned=project(r,ur,vr),back=unproject(r,turned.x,turned.y);
    assert(Math.abs(Math.hypot(back.u,back.v)-1)<1e-12,'Rotation never crosses the measured housing boundary');
    assert.equal(coverage(1.001,r),0,'The fixed outer casing cannot receive rotating pixels');
  }
  assert.equal(coverage(0,r),0);assert.equal(coverage(.285,r),0,'No duplicate rotating bearing below the fixed cap');
  assert.equal(coverage(.5,r),1,'Blade material remains fully opaque and detailed');
  assert.equal(coverage(1,r),0);
  assert(coverage(1-.4/r.ry,r)>.49&&coverage(1-.4/r.ry,r)<.51,'Subpixel-soft rim, not a halo');
  assert.equal(coverage(1-.81/r.ry,r),1,'Outer fade is shorter than one source pixel');
  const step=(angle(r,1)-angle(r,0)+Math.PI*2)%(Math.PI*2),expected=(r.speed+Math.PI*2)%(Math.PI*2);
  assert(Math.abs(step-expected)<1e-12);
  const period=Math.PI*2/Math.abs(r.speed),start=angle(r,0),end=angle(r,period);
  assert(Math.min(Math.abs(start-end),Math.PI*2-Math.abs(start-end))<1e-12,'One revolution returns seamlessly');
}
assert.notEqual(rotors[0].speed,rotors[1].speed,'Turbines turn independently');
assert.deepEqual(sample(21.5),sample(21.5),'Pause/seeking does not change rotor state');
console.log('PASS: photo registration, perspective inverse, fixed housing and cap, subpixel rim, independent continuous rotation.');
