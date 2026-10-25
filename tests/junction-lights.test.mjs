import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const W=1672,H=941,pixels=new Uint8ClampedArray(W*H*4),litPixels=new Set();
for(let p=0;p<pixels.length;p+=4)pixels.set([20,30,40,255],p);
function pane(x,y,w,h,colour){
  for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
    pixels.set([...colour,255],(py*W+px)*4);litPixels.add(py*W+px);
  }
}
// Glass inside two measured facade regions, a dark structural mullion, white
// clipped lamp cores, and a separate cyan pane that must remain unchanged.
pane(15,310,7,20,[238,171,67]);pane(24,310,8,20,[238,171,67]);
pane(15,312,7,2,[255,255,255]);pane(24,312,8,2,[255,255,255]);
pane(1600,190,12,16,[110,75,35]);
for(let y=312;y<325;y++)for(let x=38;x<48;x++)pixels.set([30,135,185,255],(y*W+x)*4);
// One central parapet fixture, its illuminated wall and wet reflection. These
// lie inside the actual 1066×1020 centre crop, below the skyline windows.
pane(790,544,9,4,[255,245,218]);pane(789,551,12,15,[172,119,54]);
pane(784,576,19,9,[183,132,62]);pane(789,577,9,4,[255,255,244]);
pixels.set([122,92,48,255],(558*W+793)*4);
pixels.set([25,155,211,255],(555*W+804)*4);
pixels.set([240,35,24,255],(555*W+808)*4);

// Minimal Canvas 2D pixel storage and standard source-over compositing. This
// exercises the production component extraction and cached mask rendering.
class Canvas {
  constructor(){this.width=0;this.height=0;this.pixels=null;this.context=null;}
  getContext(){
    if(this.context)return this.context;
    const canvas=this,stack=[];
    this.context={globalAlpha:1,globalCompositeOperation:'source-over',
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      getImageData:()=>({data:new Uint8ClampedArray(canvas.pixels)}),
      putImageData:data=>canvas.pixels=new Uint8ClampedArray(data.data),
      save(){stack.push({alpha:this.globalAlpha,operation:this.globalCompositeOperation});},
      restore(){const state=stack.pop();this.globalAlpha=state.alpha;this.globalCompositeOperation=state.operation;},
      drawImage(image,x=0,y=0){
        if(!canvas.pixels)canvas.pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
        const width=image.width??image.naturalWidth,height=image.height??image.naturalHeight;
        for(let py=0;py<height;py++)for(let px=0;px<width;px++){
          const source=(py*width+px)*4,target=((y+py)*canvas.width+x+px)*4;
          const alpha=image.pixels[source+3]/255*this.globalAlpha;if(!alpha)continue;
          for(let c=0;c<3;c++)canvas.pixels[target+c]=Math.round(image.pixels[source+c]*alpha+canvas.pixels[target+c]*(1-alpha));
          canvas.pixels[target+3]=Math.round(255*alpha+canvas.pixels[target+3]*(1-alpha));
        }
      }
    };
    return this.context;
  }
}
const api={window:{},document:{createElement:()=>new Canvas()}};
vm.runInNewContext(await readFile(new URL('../junction-lights.js',import.meta.url),'utf8'),api);
const lights=api.window.createJunctionLights({naturalWidth:W,naturalHeight:H,pixels});
assert.equal(lights.windows.length,3,'A structural mullion separates neighbouring warm panes');
assert.equal(lights.getDiagnostics().facades,2,'Window activity spans the distinct source facades');
assert.equal(lights.getDiagnostics().relitWindows,1,'Only the dim warm pane receives extra illumination');

const contains=(w,x,y)=>x>=w.x&&x<w.x+w.w&&y>=w.y&&y<w.y+w.h;
const left=lights.windows.find(w=>contains(w,16,313));
const right=lights.windows.find(w=>contains(w,1602,192));
const atPhase=(w,phase)=>(phase-w.schedule.offset+w.schedule.period)%w.schedule.period;
function frame(time){
  const target=new Canvas();target.width=W;target.height=H;target.pixels=new Uint8ClampedArray(pixels);
  lights.render(target.getContext(),time);return target.pixels;
}
const offTime=atPhase(left,left.schedule.on+left.schedule.fadeOut+left.schedule.off/2),off=frame(offTime);
for(const [x,y] of [[16,313],[16,321]]){
  const p=(y*W+x)*4;
  assert(off[p]<90,'The photographed warm source actually loses light');
  assert(off[p+1]<100&&off[p+2]<110,'White lamp cores go dark together with their room');
}
for(let p=0;p<W*H;p++)if(!litPixels.has(p)){
  for(let c=0;c<4;c++)assert.equal(off[p*4+c],pixels[p*4+c],'Concrete, mullions and cool light must stay pixel-identical');
}
const bright=frame(atPhase(right,right.schedule.on/2)),rightPixel=(192*W+1602)*4;
assert(bright[rightPixel]>pixels[rightPixel]+35,'A dim warm pane can visibly turn on');

for(const w of lights.windows){
  const s=w.schedule;assert(s.on>=34&&s.off>=9,'Long holds prevent decorative strobing');
  for(const t of [0,5,15,80,3600]){
    const a=api.window.JUNCTION_LIGHTS.sampleWindow(w,t);
    assert(a.power>0&&a.power<=1);assert.deepEqual(a,api.window.JUNCTION_LIGHTS.sampleWindow(w,t));
  }
  for(const phase of [s.on,s.on+s.fadeOut,s.on+s.fadeOut+s.off,s.period]){
    const t=atPhase(w,phase)+s.period;
    assert(Math.abs(api.window.JUNCTION_LIGHTS.sampleWindow(w,t-.0001).power-api.window.JUNCTION_LIGHTS.sampleWindow(w,t+.0001).power)<.001,'Fades and cycle wrap stay continuous');
  }
}
assert.notEqual(left.schedule.period,right.schedule.period,'Separate rooms have independent rhythms');

const fixtureOff=frame(0),fixtureOn=frame(4.2),luma=(frame,x,y)=>{
  const p=(y*W+x)*4;return frame[p]*.2126+frame[p+1]*.7152+frame[p+2]*.0722;
};
assert(luma(fixtureOn,794,546)-luma(fixtureOff,794,546)>150,'A large central lamp visibly turns on during the first five seconds');
assert(luma(fixtureOn,793,579)-luma(fixtureOff,793,579)>120,'Its photographed wet reflection changes with the source');
assert(luma(fixtureOn,792,558)-luma(fixtureOff,792,558)>25,'The warm wall spill also changes, not just the white core');
assert(luma(fixtureOff,792,558)>luma(fixtureOff,793,558),'Wall texture remains visible after emission is removed');
for(const [x,y] of [[804,555],[808,555]])for(let c=0;c<4;c++){
  const p=(y*W+x)*4+c;assert.equal(fixtureOff[p],pixels[p],'Nearby cyan accents and red signals remain untouched');
}
const {practicals,fixtureSchedules,samplePractical}=api.window.JUNCTION_LIGHTS;
assert(practicals.length>=12,'Central infrastructure has many distinct sources');
let turnOns=0,turnOffs=0;
for(let i=0;i<practicals.length;i++){
  const f=practicals[i],s=fixtureSchedules[i];assert(f.first>=2&&f.first<=8);
  const before=samplePractical(i,f.first-.01),after=samplePractical(i,f.first+.6);
  assert(Math.abs(before.power-after.power)>.9,'Each fixture makes a visible, early change');
  if(after.power>before.power)turnOns++;else turnOffs++;
  assert(s.segments.every(segment=>segment.hold>=3.5),'Visible fixtures rest between changes');
  for(const segment of s.segments){
    const t=f.first+segment.start;
    assert(Math.abs(samplePractical(i,t-.00001).power-samplePractical(i,t+.00001).power)<.001,'Fixture transitions remain continuous');
  }
  const boundary=f.first+s.period;
  assert(Math.abs(samplePractical(i,boundary-.00001).power-samplePractical(i,boundary+.00001).power)<.001,'Variable fixture cycle wraps without jumps');
  assert.deepEqual(samplePractical(i,37.2),samplePractical(i,37.2));
}
assert(turnOns>=4&&turnOffs>=4,'Some sources light while others dim; the city does not flash in unison');
assert(new Set(fixtureSchedules.map(s=>s.period)).size===practicals.length,'Infrastructure circuits have distinct schedules');
console.log('PASS: source windows and white cores, structural occlusion, relighting, central practical lamps plus wet reflections and wall spill, preserved texture/cyan/red pixels, early opposing changes, variable independent holds and continuous deterministic fades.');
