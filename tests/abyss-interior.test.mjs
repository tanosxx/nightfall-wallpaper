import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const api={window:{}};
vm.runInNewContext(await readFile(new URL('../abyss-interior.js',import.meta.url),'utf8'),api);
const {sample,routines,bounds,panes,furniture,monitors}=api.window.ABYSS_INTERIOR;
const close=(a,b,label,tolerance=1e-5)=>assert(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
const ids=Array.from(routines,r=>r.id),step=.05;
assert(routines.length>=6,'Observatory has several independent inhabitants');
assert.equal(new Set(ids).size,ids.length,'People have stable unique identities');
const stats=new Map(ids.map(id=>[id,{walk:0,wait:0,sit:0,rising:0,sitting:0,directions:new Set(),actions:new Set()}]));
const head=p=>({x:p.x+p.direction*(p.lean*p.height+p.headTurn*1.6),y:p.y-p.bob-p.height*.895+p.sit*p.height*.18});
let previous=sample(0),maximumStep=0,maximumSitStep=0;
const duration=Math.max(...routines.map(r=>r.period))*4;

// Follow every person through multiple complete routines. Checks describe
// physical continuity, rather than a fixed count or the old 49-second route.
for(let t=0;t<=duration;t+=step){
  const state=sample(t);
  assert.equal(JSON.stringify(state),JSON.stringify(sample(t)),'Paused sampling is identical');
  assert.deepEqual(Array.from(state.people,p=>p.id),ids,'No person appears or disappears between actions');
  for(let i=0;i<state.people.length;i++){
    const p=state.people[i],old=previous.people[i],routine=routines[i],stat=stats.get(p.id);
    assert(p.x>=bounds.x&&p.x<=bounds.x+bounds.w);
    assert(p.y-p.height>=bounds.y&&p.y<=bounds.y+bounds.h);
    assert(p.height>=14&&p.height<=23,'Distant human scale');
    close(p.height,routine.height,'Body scale does not jump when sitting');
    assert(p.opacity>.25&&p.opacity<.7,'Glass reflections remain partially visible');
    assert([p.x,p.y,p.height,p.sit,p.pace,p.lean,p.reach,p.armLift,p.gesture,p.headTurn,p.carry,p.stride,p.bob].every(Number.isFinite));
    assert(p.sit>=0&&p.sit<=1&&p.pace>=0&&p.pace<=1);
    const moved=Math.hypot(p.x-old.x,p.y-old.y),sitStep=Math.abs(p.sit-old.sit);
    maximumStep=Math.max(maximumStep,moved);maximumSitStep=Math.max(maximumSitStep,sitStep);
    assert(moved<=8*step+1e-6,`${p.id}: no route teleport`);
    assert(sitStep<.07,`${p.id}: sitting/standing is interpolated`);
    if(p.pace>.1){stat.walk++;stat.directions.add(p.direction);assert(p.sit===0,'Walking begins only after standing');}
    else stat.wait++;
    if(p.sit>.99)stat.sit++;
    if(p.sit>old.sit+.001)stat.sitting++;
    if(p.sit<old.sit-.001)stat.rising++;
    stat.actions.add(p.action);
  }
  assert.equal(state.monitorPower.length,monitors.length);
  assert.equal(state.monitorScan.length,monitors.length);
  assert(state.monitorPower.every(p=>Number.isFinite(p)&&p>=0&&p<=.3),'Screens keep a restrained glow');
  assert(state.monitorScan.every(p=>Number.isFinite(p)&&p>=0&&p<1),'Screen scan remains inside each monitor');
  previous=state;
}

let checkedSeams=0,seatedRoutines=0;
const epsilon=1e-5,continuous=['x','y','height','sit','pace','lean','reach','armLift','gesture','headTurn','carry','cup','bob','stride'];
for(let i=0;i<routines.length;i++){
  const routine=routines[i],stat=stats.get(routine.id),start=routine.period*2-routine.offset;
  const at=phase=>sample(start+phase).people[i];
  let elapsed=0;
  for(const node of routine.nodes){
    assert(stat.actions.has(node.action),`${routine.id}: missing ${node.action} task`);
    const resting=at(elapsed+node.wait/2);
    close(resting.x,node.x,'Wait holds its destination x');close(resting.y,node.y,'Wait holds its destination floor');
    assert.equal(resting.action,node.action);
    if(node.seated)close(resting.sit,1,'Seated task reaches the chair');
    else close(resting.sit,0,'Standing task stays upright');
    for(const boundary of [elapsed,elapsed+node.wait,elapsed+node.wait+node.travel]){
      const a=at(boundary-epsilon),b=at(boundary+epsilon);
      for(const key of continuous)close(a[key]??0,b[key]??0,`${routine.id}: continuous ${key} at ${boundary}`,1e-3);
      const ha=head(a),hb=head(b);
      close(ha.x,hb.x,`${routine.id}: no mirrored head jump at a turn`,.002);
      close(ha.y,hb.y,`${routine.id}: head does not pop during sit/stand`,.002);
      if(a.direction!==b.direction)assert(a.pace<1e-5&&b.pace<1e-5,'Turn happens while stopped');
      checkedSeams++;
    }
    elapsed+=node.wait+node.travel;
  }
  const a=at(0),b=at(routine.period);
  for(const key of ['x','y','sit','pace'])close(a[key],b[key],`${routine.id}: route closes at cycle seam`);
  assert(stat.wait>50,'Each routine includes meaningful pauses');
  if(routine.nodes.some(n=>n.travel>0)){
    assert(stat.walk>100&&stat.directions.size===2,`${routine.id}: travels and returns`);
  }else assert.equal(stat.walk,0,'Settled worker stays at the desk');
  if(routine.nodes.some(n=>n.seated)&&!routine.settled){
    seatedRoutines++;
    assert(stat.sit>100&&stat.rising>10&&stat.sitting>10,`${routine.id}: completes sitting, task, rising and return`);
  }
}
assert(seatedRoutines>=2,'Different occupants sit down and later stand up');
assert(sample(5).people.filter((p,i)=>Math.hypot(p.x-sample(0).people[i].x,p.y-sample(0).people[i].y)>10).length>=2,'Multiple routes read within five seconds');
assert(new Set(sample(5).people.map(p=>p.action)).size>=3,'Routines are not synchronized copies');
assert(panes.length>=15&&furniture.length>=3,'Glass and foreground furniture are separately masked');
for(const t of [NaN,Infinity,-10])assert.equal(JSON.stringify(sample(t)),JSON.stringify(sample(0)));
console.log(JSON.stringify({status:'PASS',inhabitants:routines.length,seconds:duration,checkedSeams,seatedRoutines,maximumStep,maximumSitStep,glassPanes:panes.length}));
console.log('PASS: independent closed routines, continuous seating/standing/routes/turns, stable scale, deterministic pause and bounded screen activity.');
