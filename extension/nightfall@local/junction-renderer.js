/* Approved photographic Junction scene, drawn natively by GNOME's Cairo.
 * Geometry and schedules match the browser scene. Pixel masks are baked once
 * by tests/build-junction-native-assets.py; no DOM, subprocess or pixel scanning
 * occurs inside GNOME Shell. */
import Cairo from 'cairo';
import {Data, Motion, Traffic, Lights, Beacons, Atmosphere} from './junction-models.js';
import {ASSETS} from './junction-native-assets.js';
const {W,H}=Data, TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
function polygon(cr,points){cr.newPath();points.forEach(([x,y],i)=>i?cr.lineTo(x,y):cr.moveTo(x,y));cr.closePath();}
function subpath(cr,points){points.forEach(([x,y],i)=>i?cr.lineTo(x,y):cr.moveTo(x,y));cr.closePath();}
function rgb(cr,color,alpha=1){cr.setSourceRGBA(color[0]/255,color[1]/255,color[2]/255,alpha);}
function ellipse(cr,x,y,rx,ry){cr.save();cr.translate(x,y);cr.scale(rx,ry);cr.arc(0,0,1,0,TAU);cr.restore();}
// GJS Cairo does not expose context.transform(). This decomposition implements
// the same affine shear used to align the photographic carriage with its rails.
function affine(cr,a,b,c,d,x,y){
 const v=.5*Math.atan2(2*(a*c+b*d),a*a+b*b-c*c-d*d),ux=a*Math.cos(v)+c*Math.sin(v),uy=b*Math.cos(v)+d*Math.sin(v),scale=Math.hypot(ux,uy);
 cr.translate(x,y);cr.rotate(Math.atan2(uy,ux));cr.scale(scale,(a*d-b*c)/scale);cr.rotate(-v);
}
export function routePoint(id,u){
 const route=Data.routes.find(r=>r.id===id),k=id==='lower'?1.38:1.13,s=u/(k+(1-k)*u),p=Data.routeAt(route,clamp(s));
 if(s<0||s>1){const delta=(s-clamp(s))*(route.end[0]-route.start[0]);p.x+=delta;p.y+=delta*p.slope;}return p;
}
export function carGeometry(train,index){
 const spacing=train.span/train.cars,center=train.head-(index+.5)*spacing,u=train.direction===1?center:1-center,half=spacing*.487;
 const a=routePoint(train.id,u-half),b=routePoint(train.id,u+half),p=routePoint(train.id,u);for(const point of[a,b,p])point.y+=point.halfGauge;
 const width=b.x-a.x,height=1.23*width/(2066/402);
 return{a,b,p,u,width,height,slope:(b.y-a.y)/width,visible:u+half>=0&&u-half<=1,direction:index===train.cars-1?-train.direction:train.direction,cab:index===0||index===train.cars-1};
}
function corridor(route){
 const left=[],right=[];
 for(let i=0;i<=40;i++){const u=i/40,p=Traffic.routePoint(route,u),w=route.clip[0]+(route.clip[1]-route.clip[0])*u;left.push([p.x+p.nx*w,p.y+p.ny*w]);right.unshift([p.x-p.nx*w,p.y-p.ny*w]);}
 return[...left,...right];
}
class JunctionRenderer{
 constructor(imagePath){
  if(!imagePath)throw new Error('Junction requires its original photograph.');
  this.time=0;this.weather=1;this.destroyed=false;this.glows=new Map();this.windows=[];this.vehicles=[];
  try {
   this.photo=Cairo.ImageSurface.createFromPNG(imagePath);
   this.atlas=Cairo.ImageSurface.createFromPNG(imagePath.replace(/\/[^/]+$/,'/junction-native/atlas.png'));
   this.windows=ASSETS.windows.map(w=>{
   const schedule=(w.active?Lights.activeSchedule:Lights.schedule)(w.seed);
   if(w.firstOut!==null)schedule.offset=schedule.on-w.firstOut;
   if(w.firstIn!==null)schedule.offset=schedule.on+schedule.fadeOut+schedule.off-w.firstIn;
   return{...w,schedule};
  });
  this.corridors=Traffic.routes.map(corridor);
   this.state=Motion.sample(0);this.vehicles=Traffic.sample(0);
  } catch(error) {
   this.destroy();
   throw error;
  }
 }
 update(dt,_pointer={},weather=1){
  if(this.destroyed)return;
  this.time+=clamp(Number.isFinite(dt)?dt:0,0,.1);
  this.weather=clamp(Number.isFinite(weather)?weather:1);
  this.state=Motion.sample(this.time);this.vehicles=Traffic.sample(this.time);
 }
 sprite(cr,s,alpha=1,x=s.x??0,y=s.y??0,w=s.w,h=s.h){
  if(alpha<.001||w<=0||h<=0)return;
  cr.save();cr.translate(x,y);cr.scale(w/s.w,h/s.h);cr.rectangle(0,0,s.w,s.h);cr.clip();
  cr.setSourceSurface(this.atlas,-s.ax,-s.ay);cr.paintWithAlpha(clamp(alpha));cr.restore();
 }
 glow(cr,x,y,rx,ry,color,alpha){
  if(alpha<.001||rx<=0||ry<=0)return;
  const key=color.join(',');let texture=this.glows.get(key);
  if(!texture){texture=new Cairo.ImageSurface(Cairo.Format.ARGB32,64,64);const c=new Cairo.Context(texture),g=new Cairo.RadialGradient(32,32,0,32,32,32);
   for(const[at,a]of[[0,1],[.25,.5],[1,0]])g.addColorStopRGBA(at,color[0]/255,color[1]/255,color[2]/255,a);
   c.setSource(g);c.paint();c.$dispose();this.glows.set(key,texture);}
  cr.save();cr.translate(x,y);cr.scale(rx/32,ry/32);cr.setSourceSurface(texture,-32,-32);cr.paintWithAlpha(alpha);cr.restore();
 }
 drawBase(cr){
  for(const s of ASSETS.clean)this.sprite(cr,s);
  ASSETS.neon.forEach((n,i)=>this.sprite(cr,n.dim,1-Atmosphere.neonAt(i,this.time).brightness));
 }
 drawLights(cr){
  for(const w of this.windows){const power=Lights.sampleWindow(w,this.time).power;this.sprite(cr,w.dark,1-power);if(w.relight)this.sprite(cr,w.bright,power*.72);}
  ASSETS.fixtures.forEach((s,i)=>this.sprite(cr,s,1-Lights.samplePractical(i,this.time).power));
 }
 drawSignals(cr){
  Data.signals.forEach((f,index)=>{
   const s=this.state.signals.find(s=>s.id===f.id),r=f.scale;
   cr.save();cr.setLineWidth(2.3*r);rgb(cr,[20,29,33]);cr.moveTo(...f.base);cr.lineTo(f.x,f.y+8*r);cr.stroke();
   rgb(cr,[137,164,169],.35);cr.setLineWidth(.55*r);cr.moveTo(f.base[0]-.7*r,f.base[1]);cr.lineTo(f.x-.7*r,f.y+7*r);cr.stroke();
   rgb(cr,[10,16,20]);cr.rectangle(f.x-3.1*r,f.y-7*r,6.2*r,16*r);cr.fillPreserve();rgb(cr,[60,75,80]);cr.setLineWidth(.6*r);cr.stroke();
   ['red','amber','green'].forEach((color,i)=>{
    const c=color==='red'?[255,67,40]:color==='amber'?[255,184,61]:[103,237,164],pulse=color==='red'?.2+.8*Beacons.power(this.time,3.1+index*.19,index*.47):1;
    const power=s.levels[color]*pulse,y=f.y+(i-1)*4.8*r;rgb(cr,c,.08+power*.87);cr.arc(f.x,y,1.45*r,0,TAU);cr.fill();
    cr.setOperator(Cairo.Operator.SCREEN);this.glow(cr,f.x,y,8*r,8*r,c,power*.32);cr.setOperator(Cairo.Operator.OVER);
   });cr.restore();
  });
 }
 drawSwitches(cr){
  for(const f of Data.switches){const s=this.state.switches.find(s=>s.id===f.id),offset=(s.position-.5)*2.3*f.scale;
   cr.save();cr.setLineCap(Cairo.LineCap.ROUND);cr.setLineWidth(.9*f.scale);rgb(cr,[163,180,180],.70);
   for(const[a,b,c]of f.blades){const bx=b[0]+offset,by=b[1],cx=c[0]+offset*1.7,cy=c[1];cr.moveTo(...a);cr.curveTo(a[0]+(bx-a[0])*2/3,a[1]+(by-a[1])*2/3,cx+(bx-cx)*2/3,cy+(by-cy)*2/3,cx,cy);cr.stroke();}
   const[x,y]=f.indicator;rgb(cr,[20,29,34]);cr.rectangle(x-2.5*f.scale,y-2*f.scale,5*f.scale,4*f.scale);cr.fill();rgb(cr,s.moving?[199,163,102]:[160,190,183]);cr.moveTo(x-1.6*f.scale,y);cr.lineTo(x+1.6*f.scale,y-offset*1.1);cr.stroke();cr.restore();
  }
 }
 drawBeacons(cr){
  for(const l of Beacons.sample(this.time)){
   this.sprite(cr,ASSETS.beacons[l.id],1-l.power);cr.save();cr.setOperator(Cairo.Operator.SCREEN);
   this.glow(cr,l.x,l.y,8*l.scale,8*l.scale,[255,49,50],l.power*.82);rgb(cr,[255,116,100],l.power*.9);ellipse(cr,l.x,l.y,Math.max(.65,l.scale*1.25),Math.max(.65,l.scale));cr.fill();cr.restore();
  }
 }
 drawTraffic(cr){
  Traffic.routes.forEach((route,ri)=>{
   cr.save();polygon(cr,this.corridors[ri]);cr.clip();
   // Cut out original pillars/gantries before drawing any vehicle. This keeps
   // all other live layers intact and prevents trails leaking through walls.
   cr.newPath();cr.rectangle(0,0,W,H);for(const p of route.occlusion)subpath(cr,p);cr.setFillRule(Cairo.FillRule.EVEN_ODD);cr.clip();cr.setFillRule(Cairo.FillRule.WINDING);
   for(const car of this.vehicles){if(car.route!==route.id||car.opacity<.001)continue;
    cr.save();cr.translate(car.x,car.y);cr.rotate(Math.atan2(car.dy*car.direction,car.dx*car.direction));const l=car.length,w=car.width,a=car.opacity;
    rgb(cr,[2,8,12],.48*a);ellipse(cr,0,.4*car.scale,l*.60,w*.70);cr.fill();
    if(car.scale>.38){polygon(cr,[[-l*.48,-w*.46],[l*.30,-w*.46],[l*.48,-w*.27],[l*.48,w*.27],[l*.30,w*.46],[-l*.48,w*.46]]);rgb(cr,[19,27,31],.94*a);cr.fillPreserve();rgb(cr,[103,122,126],.37*a);cr.setLineWidth(.42*car.scale);cr.stroke();rgb(cr,[57,76,83],.65*a);cr.rectangle(-l*.04,-w*.34,l*.21,w*.68);cr.fill();}
    const x=l*.3,energy=car.intensity*a;cr.setOperator(Cairo.Operator.SCREEN);this.glow(cr,x,0,car.glowRadius,car.glowRadius,car.color,.62*energy);
    const tail=new Cairo.LinearGradient(x-car.trail,0,x,0);for(const[at,alpha]of[[0,0],[.55,.45],[1,.8]])tail.addColorStopRGBA(at,...car.color.map(v=>v/255),alpha*energy);
    cr.setSource(tail);cr.setLineWidth(.85+car.scale*.38);cr.setLineCap(Cairo.LineCap.ROUND);cr.moveTo(x-car.trail,0);cr.lineTo(x,0);cr.stroke();this.glow(cr,x+1.8*car.scale,0,5.4*car.scale,1.8*car.scale,car.color,.25*energy);
    rgb(cr,car.color,energy);for(const side of[-1,1]){const y=side*Math.max(.7,w*.34),core=.98+car.scale*.38;cr.rectangle(x-core/2,y-.43,core,.86);}cr.fill();cr.restore();
   }cr.restore();
  });
 }
 reflectedLight(cr,train,cars){
  const surface=Data.facades.find(f=>f.id==='upper-front');cr.save();polygon(cr,surface.polygon);cr.clip();cr.setOperator(Cairo.Operator.SCREEN);
  for(const c of cars){if(!c.visible)continue;this.glow(cr,c.p.x,c.p.y+22,c.width*.65,45,[226,159,83],surface.gain*.69);
   for(let j=1;j<8;j++){const x=c.a.x+c.width*j/8,y=c.a.y+(x-c.a.x)*c.slope;this.glow(cr,x,y+14,c.width*.032,33,[244,177,95],surface.gain*.45);}}
  const u=train.direction===1?train.head:1-train.head;if(u>-.12&&u<1.12){const p=routePoint(train.id,u);this.glow(cr,p.x+train.direction*65,p.y+12,75,30,[172,206,218],surface.gain*.7);}cr.restore();
 }
 drawTrain(cr){
  const train=this.state.trains.find(t=>t.id==='upper');if(!train.active)return;
  const route=Data.routes.find(r=>r.id==='upper'),cars=Array.from({length:train.cars},(_,i)=>carGeometry(train,i));this.reflectedLight(cr,train,cars);
  cr.save();cr.rectangle(route.start[0],0,route.end[0]-route.start[0],H);cr.clip();cr.newPath();cr.rectangle(0,0,W,H);for(const p of route.occlusion)subpath(cr,p);cr.setFillRule(Cairo.FillRule.EVEN_ODD);cr.clip();cr.setFillRule(Cairo.FillRule.WINDING);
  for(const c of cars.filter(c=>c.visible).sort((a,b)=>a.p.x-b.p.x)){
   cr.save();affine(cr,1,c.slope,0,1,c.a.x,c.a.y);rgb(cr,[4,10,13],.4);ellipse(cr,c.width*.5,0,c.width*.48,Math.max(1.2,c.height*.065));cr.fill();cr.restore();
   cr.save();const d=c.direction,p=d===1?c.a:c.b;affine(cr,d,d*c.slope,0,1,p.x,p.y);this.sprite(cr,ASSETS.stock[c.cab?'cab':'coach'],.88,0,-c.height,c.width,c.height);cr.restore();
  }
  cr.setOperator(Cairo.Operator.SCREEN);
  for(const[rear,distance]of[[false,train.head],[true,train.head-train.span]]){const u=train.direction===1?distance:1-distance;if(u<0||u>1)continue;const p=routePoint(train.id,u),c=cars[rear?cars.length-1:0];this.glow(cr,p.x-train.direction*(rear?-2:3),p.y+p.halfGauge-c.height*.34,c.height*.22,c.height*.15,rear?[238,58,38]:[193,220,231],rear?.4:.52);}cr.restore();
 }
 drawAtmosphere(cr){
  for(let v=0;v<Atmosphere.steamSources.length;v++)for(let i=0;i<10;i++){const p=Atmosphere.steamAt(v,i,this.time);if(p.alpha<.002)continue;
   cr.save();cr.translate(p.x,p.y);cr.rotate(p.rotation);cr.scale(p.stretch,1/p.stretch);this.sprite(cr,ASSETS.plumes[(i+v*3)%7],p.alpha,-p.radius,-p.radius,p.radius*2,p.radius*2);cr.restore();}
  cr.save();cr.setOperator(Cairo.Operator.SCREEN);
  ASSETS.neon.forEach((n,i)=>this.sprite(cr,n.emission,(.06+.06*(.5+.5*Math.sin(this.time*(.19+i*.012)+Data.neon[i].phase)))*Atmosphere.neonAt(i,this.time).brightness));cr.restore();
  cr.setLineCap(Cairo.LineCap.ROUND);for(let i=0;i<Math.round(Atmosphere.drops.length*this.weather);i++){const d=Atmosphere.rainAt(i,this.time);rgb(cr,[176,204,216],d.alpha);cr.setLineWidth(d.width);cr.moveTo(d.x,d.y);cr.lineTo(d.x-d.length*.075,d.y+d.length);cr.stroke();}
 }
 paint(cr,width,height){
  if(this.destroyed)return;cr.save();cr.setOperator(Cairo.Operator.CLEAR);cr.paint();cr.setOperator(Cairo.Operator.OVER);
  const scale=Math.max(width/W,height/H);cr.translate((width-W*scale)/2,(height-H*scale)/2);cr.scale(scale,scale);
  cr.setSourceSurface(this.photo,0,0);cr.paint();this.drawBase(cr);this.drawLights(cr);this.drawSwitches(cr);this.drawSignals(cr);this.drawBeacons(cr);this.drawTraffic(cr);this.drawTrain(cr);this.drawAtmosphere(cr);cr.restore();
 }
 getDiagnostics(){return{time:this.time,weather:this.weather,visibleTracks:['upper'],windows:this.windows.length,facades:new Set(this.windows.map(w=>w.facade)).size,trafficRoutes:Traffic.routes.length,trafficDirections:16,vehicles:this.vehicles.length,steamSources:Atmosphere.steamSources.length,beacons:Beacons.lamps.length,signals:Data.signals.length};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.photo?.finish();this.atlas?.finish();this.photo=null;this.atlas=null;for(const s of this.glows.values())s.finish();this.glows.clear();this.windows=[];this.vehicles=[];}
}
export function createJunctionRenderer(imagePath){return new JunctionRenderer(imagePath);}
