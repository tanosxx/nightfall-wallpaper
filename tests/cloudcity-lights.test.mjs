import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const W=1672,H=941,pixels=new Uint8ClampedArray(W*H*4);
for(let p=0;p<pixels.length;p+=4)pixels.set([27,37,49,255],p);
function pane(x,y,w,h,colour){for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)pixels.set([...colour,255],(py*W+px)*4);}
pane(204,22,10,12,[237,172,75]);pane(219,22,10,12,[237,172,75]);
pane(204,23,10,2,[255,255,255]);pane(219,23,10,2,[255,255,255]);
pane(234,22,10,12,[25,146,207]);pane(321,42,10,12,[113,82,41]);
pane(703,255,3,6,[231,163,74]);pane(709,255,3,6,[231,163,74]);
pane(514,124,3,3,[255,32,48]);
pane(559,248,7,2,[251,214,180]); // Sunset immediately around a red mast light.

class Canvas{
  constructor(){this.width=0;this.height=0;this.pixels=null;this.context=null;}
  getContext(){
    if(this.context)return this.context;const canvas=this,stack=[];
    this.context={globalAlpha:1,globalCompositeOperation:'source-over',
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:()=>({data:new Uint8ClampedArray(canvas.pixels)}),
      putImageData:data=>canvas.pixels=new Uint8ClampedArray(data.data),
      save(){stack.push({alpha:this.globalAlpha,operation:this.globalCompositeOperation});},
      restore(){const s=stack.pop();this.globalAlpha=s.alpha;this.globalCompositeOperation=s.operation;},
      drawImage(image,x=0,y=0){
        if(!canvas.pixels)canvas.pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
        const width=image.width??image.naturalWidth,height=image.height??image.naturalHeight;
        for(let py=0;py<height;py++)for(let px=0;px<width;px++){
          const from=(py*width+px)*4,to=((y+py)*canvas.width+x+px)*4,alpha=image.pixels[from+3]/255*this.globalAlpha;
          if(alpha)for(let c=0;c<3;c++)canvas.pixels[to+c]=Math.round(image.pixels[from+c]*alpha+canvas.pixels[to+c]*(1-alpha));
          canvas.pixels[to+3]=255;
        }
      },
      createRadialGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},ellipse(){},fill(){}
    };return this.context;
  }
}
const api={window:{},document:{createElement:()=>new Canvas()}};
vm.runInNewContext(await readFile(new URL('../cloudcity-lights.js',import.meta.url),'utf8'),api);
const {rooms,facades,beacons,timing,roomPower,beaconPower}=api.window.CLOUDCITY_LIGHTS;
const lights=api.window.createCloudcityLights({naturalWidth:W,naturalHeight:H,pixels});
assert.equal(lights.circuits.length,4,'Shared large-room panes are one circuit; small distant panes are independent');
assert(rooms.length>=10&&facades.length>=24&&beacons.length>=20,'Activity reaches both close towers and the distant skyline');
function frame(time,strength){const canvas=new Canvas();canvas.width=W;canvas.height=H;canvas.pixels=new Uint8ClampedArray(pixels);lights.render(canvas.getContext(),time,strength);return canvas.pixels;}
const off=frame(3.2),bright=frame(4.5);
for(const [x,y] of [[207,23],[207,28],[222,23],[222,28]]){
  const p=(y*W+x)*4;assert(off[p]<100&&off[p+1]<110&&off[p+2]<125,'The glass and white emission core turn off together');
}
for(const [x,y] of [[216,25],[238,25],[230,31],[334,48],[562,248],[564,249]]){
  const p=(y*W+x)*4;assert.deepEqual([...off.slice(p,p+4)],[...pixels.slice(p,p+4)],'Concrete, window mullions and cyan light remain unchanged');
}
assert(bright[(47*W+325)*4]>pixels[(47*W+325)*4]+35,'A dim room can visibly switch on');
const strengthZero=frame(3.2,0);assert.deepEqual(strengthZero,pixels,'Zero strength leaves the original photo intact');
let earlyOn=0,earlyOff=0;
for(let i=0;i<rooms.length;i++){
  const s=timing(i*137+71,rooms[i]);assert(s.first>=2&&s.first<=8);
  const before=roomPower(s,s.first-.01),after=roomPower(s,s.first+1);
  assert(Math.abs(after-before)>.65,'Large rooms have a visible early change');
  if(after>before)earlyOn++;else earlyOff++;
  assert(s.segments.every(a=>a.hold>=4.5),'Long independent holds avoid decorative flickering');
  for(const a of s.segments){
    const t=s.first+a.start;assert(Math.abs(roomPower(s,t-.00001)-roomPower(s,t+.00001))<.001,'Room fade boundaries are continuous');
  }
  const t=s.first+s.period;assert(Math.abs(roomPower(s,t-.00001)-roomPower(s,t+.00001))<.001,'Schedules also wrap continuously');
  assert.equal(roomPower(s,923.4),roomPower(s,923.4));
}
assert(earlyOn>=4&&earlyOff>=4,'Some rooms light while others darken');
assert(new Set(beacons.map(b=>b.period)).size===beacons.length,'Roof beacons use distinct periods');
for(const beacon of beacons){
  const peak=beacon.period-beacon.offset%beacon.period;
  assert(beaconPower(beacon,peak)>.99&&beaconPower(beacon,peak+beacon.period*.5)<.02,'Each red source pulses fully');
  assert(Math.abs(beaconPower(beacon,peak-.00001)-beaconPower(beacon,peak+.00001))<.001);
}
const beacon=beacons[0],peak=beacon.period-beacon.offset%beacon.period;
assert(frame(peak)[(125*W+515)*4]-frame(peak+beacon.period*.5)[(125*W+515)*4]>180,'The photographed red source really dims instead of only receiving an overlay');
console.log('PASS: source-emission masks, white cores, preserved mullions/cyan/walls, distant independent panes, early opposing room changes, continuous variable schedules, actual red source dimming and asynchronous beacon pulses.');
