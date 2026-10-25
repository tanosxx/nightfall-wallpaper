import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../cloudcity-scene.js',import.meta.url),'utf8');

// Run the production controller with controlled image/bitmap readiness and
// browser event delivery. The renderer is stubbed so its received clock and
// settings can be observed independently of the visual tests.
function createController(){
  const raf=new Map(),events={},documentEvents={},elements=new Map(),photos=[],samples=[],errors=[];
  let nextFrame=0,resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const ctx=new Proxy({},{get:()=>()=>{}});
  function element(id){
    if(!elements.has(id))elements.set(id,{
      dataset:{},style:{},hidden:true,
      classList:{add(){},remove(){},toggle(){}},
      getContext:()=>ctx,addEventListener(){},setAttribute(){}
    });
    return elements.get(id);
  }
  const parent={};
  const document={hidden:false,getElementById:element,querySelector:()=>element('background'),
    addEventListener:(name,handler)=>documentEvents[name]=handler};
  const context={
    document,parent,innerWidth:1280,innerHeight:720,devicePixelRatio:2,
    location:{search:'?embed=1',origin:'http://127.0.0.1:8847'},URLSearchParams,
    HTMLInputElement:class{},HTMLButtonElement:class{},console:{error:error=>errors.push(error)},
    Image:class{constructor(){this.naturalWidth=1672;this.naturalHeight=941;photos.push(this);}},
    setTimeout:()=>0,clearTimeout(){},
    requestAnimationFrame:handler=>{raf.set(++nextFrame,handler);return nextFrame;},
    cancelAnimationFrame:id=>raf.delete(id),
    window:{
      addEventListener:(name,handler)=>events[name]=handler,
      createCloudcityScene:photo=>{
        assert.equal(photo,photos[0]);
        return {ready,render:(_,time,strength,windTime)=>samples.push({time,strength,windTime})};
      }
    }
  };
  vm.runInNewContext(source,context);
  return {
    raf,errors,element,resolveReady,rejectReady,
    sample:()=>samples.at(-1),load:()=>photos[0].onload(),
    resize(width,height){context.innerWidth=width;context.innerHeight=height;events.resize();},
    deliver(now){
      assert.equal(raf.size,1,'Exactly one pending animation callback');
      const [id,handler]=raf.entries().next().value;raf.delete(id);handler(now);
    },
    message(data,override={}){
      events.message({source:parent,origin:context.location.origin,
        data:{type:'nightfall:settings',...data},...override});
    },
    visibility(hidden){document.hidden=hidden;documentEvents.visibilitychange();}
  };
}

const scene=createController();
assert.equal(scene.raf.size,0,'No animation clock before photo loading');
assert.equal(scene.element('atmosphere').dataset.ready,'false');
scene.message({paused:true,weather:.3});
const loading=scene.load();
assert.equal(scene.raf.size,0,'Photo readiness alone does not start the clock');
assert.equal(scene.sample(),undefined,'No render before required bitmaps are ready');
scene.message({paused:true,weather:.2});
scene.resolveReady();await loading;
assert.equal(scene.element('atmosphere').dataset.ready,'true');
assert.equal(scene.raf.size,0,'Startup pause remains active after bitmap readiness');
assert.deepEqual(scene.sample(),{time:0,strength:.2,windTime:0},'Parent settings received during loading are retained');

for(const [width,height] of [[640,900],[1000,1000],[1920,1080],[2560,1080]]){
  scene.resize(width,height);
  const [w,h]=scene.element('background').style.backgroundSize.split(' ').map(parseFloat);
  const [x,y]=scene.element('background').style.backgroundPosition.split(' ').map(parseFloat);
  assert.ok(w<=width+.001&&h<=height+.001&&x>=-.001&&y>=-.001,
    'Cloudcity preview must show both outer facades at any panel aspect ratio');
  assert.ok(Math.abs(w/h-1672/941)<1e-9,'Full-scene preview preserves the photograph proportions');
}

scene.message({paused:false,weather:.2});
scene.deliver(900000);
assert.equal(scene.sample().time,0,'First ready frame starts at zero despite time spent loading');
scene.deliver(901000);assert.equal(scene.sample().time,1);assert.ok(Math.abs(scene.sample().windTime-.62)<1e-9,'Wind clock integrates the selected speed');
scene.message({paused:true,weather:.2});
assert.equal(scene.raf.size,0,'Pause cancels the pending animation frame');
scene.message({paused:false,weather:.2});
scene.deliver(1800000);
assert.equal(scene.sample().time,1,'Resuming does not replay paused time');
scene.deliver(1801000);assert.equal(scene.sample().time,2);
scene.visibility(true);assert.equal(scene.raf.size,0,'A hidden document stops scheduling');
scene.visibility(false);scene.deliver(2700000);
assert.equal(scene.sample().time,2,'Becoming visible does not replay hidden time');

const beforeWind=scene.sample().windTime;scene.message({paused:false,weather:1});assert.equal(scene.sample().windTime,beforeWind,'Changing wind does not jump the cloud texture');scene.deliver(2701000);assert.ok(Math.abs(scene.sample().windTime-beforeWind-1.5)<1e-9,'Wind speed changes future motion only');
const trusted={...scene.sample()};
scene.message({paused:true,weather:0},{origin:'https://untrusted.example'});
scene.message({paused:true,weather:0},{source:{}});
scene.message({type:'unrelated',paused:true,weather:0});
assert.deepEqual(scene.sample(),trusted,'Wrong-origin, non-parent and unrelated messages are ignored');
assert.equal(scene.raf.size,1,'Untrusted messages cannot stop the animation');

const failed=createController(),failedLoad=failed.load();
failed.rejectReady(new Error('Cloud renderer is unavailable'));await failedLoad;
assert.equal(failed.raf.size,0,'Rejected bitmap readiness does not start an incomplete scene');
assert.equal(failed.element('atmosphere').dataset.ready,'false');
assert.equal(failed.element('error').hidden,false,'A failed asset load is visible to the user');
assert.equal(failed.errors.length,1);

console.log('PASS: loading-ready gate, parent settings and startup pause, zero startup clock, pause/resume, visibility, untrusted messages, failed bitmap readiness.');
