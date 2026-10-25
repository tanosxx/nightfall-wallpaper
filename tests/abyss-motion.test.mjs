import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const waterSource=await readFile(new URL('../abyss-water.js',import.meta.url),'utf8');
const elevatorSource=await readFile(new URL('../abyss-elevator.js',import.meta.url),'utf8');
const sceneSource=await readFile(new URL('../abyss-scene.js',import.meta.url),'utf8');
const api={window:{}};
vm.runInNewContext(waterSource,api);
vm.runInNewContext(elevatorSource,api);
const {W,H,grains,particleAt,bubbleAt}=api.window.ABYSS_WATER;
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} != ${expected}`);

// Pure sampling makes a paused frame repeatable; every grain keeps a constant
// downstream speed and fades to zero before wrapping across a frame edge.
for(let i=0;i<grains.length;i++){
  const a=particleAt(i,0),b=particleAt(i,.25);
  close((b.x-a.x+W)%W,grains[i].speed*.25,'Current direction and speed');
  for(const t of [0,19.25,321.75]){
    const p=particleAt(i,t);
    assert(p.x>=0&&p.x<W&&p.y>=0&&p.y<H);
    assert(p.alpha>=0&&p.alpha<=grains[i].alpha);
    assert.equal(JSON.stringify(p),JSON.stringify(particleAt(i,t)));
  }
  const crossing=(W-grains[i].x)/grains[i].speed;
  const before=particleAt(i,crossing-.001),after=particleAt(i,crossing+.001);
  assert(before.x>W-1&&after.x<1,'Particle wraps instead of reversing');
  assert(before.alpha<1e-5&&after.alpha<1e-5,'No visible particle jump at wrap');
}
let bubbleWraps=0;
for(let i=0;i<39;i++){
  let previous=bubbleAt(i,0);
  for(let t=.125;t<=50;t+=.125){
    const b=bubbleAt(i,t);
    assert([b.x,b.y,b.radius,b.alpha].every(Number.isFinite));
    assert(b.radius>0&&b.alpha>=0&&b.alpha<=.4);
    assert.equal(JSON.stringify(b),JSON.stringify(bubbleAt(i,t)));
    if(b.y>previous.y){
      bubbleWraps++;
      assert(b.alpha<.012&&previous.alpha<.012,'Bubble disappears before restarting at vent');
    }
    previous=b;
  }
}
assert(bubbleWraps>=78,'Every vent bubble completed at least two rising cycles');

const lift=api.window.ABYSS_ELEVATOR,directions=new Set();
let dwells=0,previousLift=lift.sample(0);
for(let t=.25;t<=lift.cycle*2;t+=.25){
  const s=lift.sample(t);
  assert(s.y>=478&&s.y<=774,'Lift stays inside shaft');
  assert(s.width>0&&s.height>0&&Number.isFinite(s.x));
  assert(Math.abs(s.y-previousLift.y)<6,'Lift never jumps between stops');
  assert.equal(JSON.stringify(s),JSON.stringify(lift.sample(t)),'Lift sampling is deterministic');
  if(s.moving)directions.add(s.direction);
  else{dwells++;close(s.direction,0,'Stopped cabin direction');}
  previousLift=s;
}
assert(directions.has(-1)&&directions.has(1),'Lift travels both ways');
assert(dwells>40,'Lift waits at stops');
close(lift.sample(lift.cycle).y,lift.sample(0).y,'Lift loop closes');
let boundary=0;
for(const stage of lift.stages){
  boundary+=stage.duration;
  assert(Math.abs(lift.sample(boundary-.0001).y-lift.sample(boundary+.0001).y)<.01,'Stop and cycle transitions are continuous');
}

// Run the entire production controller. Only DOM, rendering and RAF delivery
// are stubbed; parent messages and visibility use their real event handlers.
function scene(){
  const raf=new Map(),events={},documentEvents={},elements=new Map(),photos=[];
  const lightingPlate={testPlate:true};
  let id=0,drawn={time:0,waterTime:0,strength:0};
  const ctx=new Proxy({setTransform(){drawn.order=[];}},{get:(target,key)=>target[key]||(()=>{})});
  const element=key=>{
    if(!elements.has(key))elements.set(key,{dataset:{},style:{},value:70,
      classList:{add(){},remove(){},toggle(){}},getContext:()=>ctx,
      addEventListener(){},setAttribute(){}});
    return elements.get(key);
  };
  const parent={};
  const document={hidden:false,getElementById:element,querySelector:()=>element('background'),
    addEventListener:(name,fn)=>documentEvents[name]=fn};
  const context={document,parent,innerWidth:1066,innerHeight:1020,devicePixelRatio:1,
    location:{search:'?embed=1',origin:'http://127.0.0.1:8847'},URLSearchParams,console,
    HTMLInputElement:class{},HTMLButtonElement:class{},
    Image:class{constructor(){photos.push(this);}},
    setTimeout:()=>0,clearTimeout(){},
    requestAnimationFrame(fn){raf.set(++id,fn);return id;},cancelAnimationFrame:key=>raf.delete(key),
    window:{addEventListener:(name,fn)=>events[name]=fn,
      ABYSS_ELEVATOR:lift,
      createAbyssWater:()=>({refract:(_,t,source)=>{assert.equal(source,lightingPlate,'Refraction must use current lighting, not baked-in photo');drawn.order.push('refract');drawn.refractTime=t;},particles:(_,waterTime,strength)=>{drawn.order.push('particles');Object.assign(drawn,{waterTime,strength});}}),
      createAbyssLighting:()=>({canvas:lightingPlate,render:(_,time)=>{drawn.order.push('lighting');drawn.time=time;}}),
      createAbyssElevator:()=>({render:(_,t)=>{drawn.order.push('elevator');drawn.elevatorY=lift.sample(t).y;}}),
      createAbyssInterior:()=>({render:(_,t)=>{drawn.order.push('interior');drawn.interiorTime=t;}}),
      createAbyssTransit:()=>({render:(_,t)=>{drawn.order.push('transit');drawn.transitTime=t;}})}};
  vm.runInNewContext(sceneSource,context);photos[0].onload();
  return {raf,drawn,document,element,
    deliver(now){assert.equal(raf.size,1,'Exactly one animation callback');const [key,fn]=raf.entries().next().value;raf.delete(key);fn(now);},
    message(data,extra={}){events.message({source:parent,origin:context.location.origin,data:{type:'nightfall:settings',...data},...extra});},
    visibility(hidden){document.hidden=hidden;documentEvents.visibilitychange();}};
}
const slow=scene(),fast=scene();
slow.deliver(0);fast.deliver(0);slow.deliver(1000);
for(let n=1;n<=60;n++)fast.deliver(n*1000/60);
// RAF advances at 60 Hz while painting is capped at 30 Hz; request a fresh
// frame through the real settings handler before inspecting the sample.
fast.message({paused:false,weather:.7});
close(slow.drawn.time,1,'1 Hz keeps wall-clock speed');
close(fast.drawn.time,1,'60 Hz keeps wall-clock speed');
close(slow.drawn.waterTime,fast.drawn.waterTime,'Current is frame-rate independent');
assert.deepEqual(slow.drawn.order,['lighting','refract','elevator','interior','transit','particles'],'Current lighting plate is refracted before interior activity');
close(slow.drawn.refractTime,slow.drawn.waterTime,'Water passes use the same time');
close(slow.drawn.interiorTime,slow.drawn.time,'Interior follows the scene clock');
close(slow.drawn.transitTime,slow.drawn.time,'Tunnel pedestrians follow the scene clock');

const paused={...slow.drawn};
slow.message({paused:true,weather:.7});assert.equal(slow.raf.size,0);
slow.message({paused:false,weather:.7});slow.deliver(181000);
assert.deepEqual(slow.drawn,paused,'Resuming does not replay paused minutes');
slow.visibility(true);assert.equal(slow.raf.size,0);
slow.visibility(false);slow.deliver(481000);
assert.deepEqual(slow.drawn,paused,'Becoming visible does not replay hidden minutes');

slow.message({paused:false,weather:0});const waterBefore=slow.drawn.waterTime;
slow.deliver(482000);close(slow.drawn.waterTime-waterBefore,.35,'Low current slows water only');
close(slow.drawn.time,2,'Light clock is unaffected by current');
slow.message({paused:false,weather:9});assert.equal(slow.element('current').value,100,'Parent strength is clamped');
const timeBefore=slow.drawn.time,waterBeforeStall=slow.drawn.waterTime;
slow.deliver(492000);close(slow.drawn.time-timeBefore,2,'Long stalls are capped');
close(slow.drawn.waterTime-waterBeforeStall,3,'Maximum current uses bounded elapsed time');
const beforeInvalid={...slow.drawn};
slow.message({paused:true,weather:0},{origin:'https://untrusted.example'});
slow.message({paused:true,weather:0},{source:{}});
slow.message({type:'unrelated',paused:true,weather:0});
assert.deepEqual(slow.drawn,beforeInvalid);assert.equal(slow.raf.size,1,'Untrusted messages do not pause the scene');
console.log(`PASS: ${grains.length} deterministic grains, ${bubbleWraps} transparent bubble wraps, continuous bidirectional elevator with stops, draw order, 1/60 Hz clocks, pause/visibility, bounded stalls and parent controls.`);
