/* Nightfall V4. Local animation; no network or third-party dependencies. */
(() => {
  'use strict';
  const data = window.NIGHTFALL;
  const sim = window.createNightfallSimulation(data);
  const canvas = document.getElementById('atmosphere');
  const ctx = canvas.getContext('2d', {alpha: true});
  const controls = document.getElementById('controls');
  const rainControl = document.getElementById('rain');
  const lifeControl = document.getElementById('life');
  const play = document.getElementById('play');
  const TAU = Math.PI * 2;
  let width=1,height=1,ratio=1,time=0,last=0,lastPaint=0,frame;
  let paused=false,hiddenByUser=false,hideTimer;
  let rain=Number(rainControl.value)/100,life=Number(lifeControl.value)/100;
  let wind=0;
  let seed=104729;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const frac=v=>v-Math.floor(v);
  const smooth=x=>x*x*(3-2*x);
  const drops=Array.from({length:740},()=>({x:random(),y:random(),z:random(),phase:random()*TAU}));
  const craft=[{y:.155,w:35,period:105,phase:.26,dir:1,left:.18,right:.69},
    {y:.222,w:20,period:82,phase:.70,dir:-1,left:.31,right:.67},
    {y:.277,w:13,period:130,phase:.08,dir:1,left:.32,right:.66},
    {y:.112,w:11,period:144,phase:.61,dir:-1,left:.26,right:.74}];
  const glows=new Map();
  function glowSprite(color){
    const key=color.join(',');if(glows.has(key))return glows.get(key);
    const c=document.createElement('canvas');c.width=c.height=64;
    const p=c.getContext('2d'),g=p.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,`rgba(${key},.95)`);g.addColorStop(.12,`rgba(${key},.45)`);g.addColorStop(.4,`rgba(${key},.12)`);g.addColorStop(1,`rgba(${key},0)`);
    p.fillStyle=g;p.fillRect(0,0,64,64);glows.set(key,c);return c;
  }
  function glow(x,y,r,color,alpha){if(alpha<=0)return;ctx.save();ctx.globalAlpha*=Math.min(1,alpha);ctx.drawImage(glowSprite(color),x-r,y-r,r*2,r*2);ctx.restore();}
  const cityPaths=data.TRAFFIC.map(route=>{
    let total=0;const lengths=[];for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],length=Math.hypot((b[0]-a[0])*data.IMAGE_WIDTH,(b[1]-a[1])*data.IMAGE_HEIGHT);lengths.push(length);total+=length;}return {...route,lengths,total};
  });
  function routePoint(route,u){let d=frac(u)*route.total;for(let i=0;i<route.lengths.length;i++){const length=route.lengths[i];if(d<=length||i===route.lengths.length-1){const a=route.points[i],b=route.points[i+1],f=d/length;return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}d-=length;}return route.points[0];}
  function fit(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);draw();}
  function inImage(){const s=Math.max(width/data.IMAGE_WIDTH,height/data.IMAGE_HEIGHT);ctx.translate((width-data.IMAGE_WIDTH*s)/2,(height-data.IMAGE_HEIGHT*s)/2);ctx.scale(s,s);}
  const background=new Image();
  let photoFlow=null;
  function lights(){
    data.LIGHTS.forEach((p,i)=>{
      const value=sim.windows[i].brightness,x=p.x*data.IMAGE_WIDTH,y=p.y*data.IMAGE_HEIGHT;
      const color=sim.windows[i].color||p.color;
      if(p.sourceWindow){
        ctx.fillStyle=`rgba(${p.offColor||[8,12,17]},${(1-value)*life})`;
        for(const [dx,dy,w,h] of p.maskRects||[[-p.w/2,-p.h/2,p.w,p.h]])ctx.fillRect(x+dx,y+dy,w,h);
        return;
      }
      ctx.fillStyle=`rgba(${p.offColor||[4,10,16]},${(1-value)*.94*life})`;ctx.fillRect(x-p.w/2,y-p.h/2,p.w,p.h);
      const a=value*life;
      if(a>.2)glow(x,y,p.kind==='neon'?Math.min(32,p.h*.65):Math.max(4,p.w*1.4),color,a*(p.kind==='neon'?.45:.45));
      ctx.fillStyle=`rgba(${color},${a*.8})`;ctx.fillRect(x-p.w/2,y-p.h/2,p.w,p.h);
    });
  }
  function traffic(){
    for(const car of sim.vehicles){
      const route=cityPaths[car.routeIndex];if(!route)continue;
      const p=routePoint(route,Math.min(.99999,car.progress));
      const behind=routePoint(route,Math.max(0,Math.min(.99999,car.progress-car.direction*.008)));
      let dx=(p[0]-behind[0])*data.IMAGE_WIDTH,dy=(p[1]-behind[1])*data.IMAGE_HEIGHT;
      const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
      const x=p[0]*data.IMAGE_WIDTH-dy*Math.abs(car.lane),y=p[1]*data.IMAGE_HEIGHT+dx*Math.abs(car.lane);
      const fade=car.alpha*life,color=car.color;
      glow(x,y,5.5,color,.6*fade);
      ctx.strokeStyle=`rgba(${color},${.6*fade})`;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x-dx*car.length,y-dy*car.length);ctx.lineTo(x,y);ctx.stroke();
      // Paired headlights, with a dim body/trail instead of identical dots.
      ctx.fillStyle=`rgba(${color},${.95*fade})`;
      ctx.fillRect(x-dy*.8-.55,y+dx*.8-.4,1.1,.8);ctx.fillRect(x+dy*.8-.55,y-dx*.8-.4,1.1,.8);
    }
  }
  function searchlights(){
    for(const p of data.SEARCHLIGHTS){
      const x=p.x*data.IMAGE_WIDTH,y=p.y*data.IMAGE_HEIGHT,angle=p.angle+Math.sin(time*TAU/(p.period||12)+p.phase)*p.swing,len=p.length*data.IMAGE_HEIGHT;
      const tx=x+Math.cos(angle)*len,ty=y+Math.sin(angle)*len,spread=.047;
      const g=ctx.createLinearGradient(x,y,tx,ty);g.addColorStop(0,`rgba(165,215,240,${.3*life})`);g.addColorStop(.5,`rgba(151,207,237,${.115*life})`);g.addColorStop(1,'rgba(151,207,237,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle-spread)*len,y+Math.sin(angle-spread)*len);ctx.lineTo(x+Math.cos(angle+spread)*len,y+Math.sin(angle+spread)*len);ctx.closePath();ctx.fill();glow(x,y,10,[170,229,250],.58*life);
    }
  }
  function ship(c){
    const phase=frac(time/c.period+c.phase),p=c.dir>0?phase:1-phase;
    const x=(c.left+(c.right-c.left)*p)*data.IMAGE_WIDTH,y=(c.y+Math.sin(time*.12+c.phase)*.002)*data.IMAGE_HEIGHT,s=c.w;
    const fade=Math.min(1,phase/.06,(1-phase)/.06);
    ctx.save();ctx.globalAlpha=fade;ctx.translate(x,y);ctx.scale(c.dir,1);
    glow(-s*.36,1,s*.6,[108,210,236],.24);
    ctx.fillStyle='#111f2deb';ctx.strokeStyle='#728d9a88';ctx.lineWidth=.65;
    ctx.beginPath();ctx.moveTo(-s*.51,0);ctx.lineTo(-s*.25,-s*.06);ctx.lineTo(-s*.13,-s*.15);ctx.lineTo(s*.10,-s*.15);ctx.lineTo(s*.21,-s*.07);ctx.lineTo(s*.46,-s*.025);ctx.lineTo(s*.55,s*.035);ctx.lineTo(s*.15,s*.11);ctx.lineTo(-s*.35,s*.08);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#acc7d3a0';ctx.fillRect(-s*.08,-s*.105,s*.19,Math.max(.6,s*.024));ctx.fillStyle='#b8f1ff';ctx.fillRect(-s*.38,s*.018,Math.max(1,s*.075),Math.max(.7,s*.032));
    ctx.fillStyle=`rgba(255,153,95,${.3+.7*Math.pow(Math.max(0,Math.sin(time*1.6+c.phase)),12)})`;ctx.fillRect(s*.22,0,1,1);ctx.restore();
  }
  function drawRain(){
    const count=Math.round(drops.length*rain);
    for(let layer=0;layer<3;layer++){
      ctx.beginPath();
      for(let i=0;i<count;i++){
        const d=drops[i];if(Math.min(2,Math.floor(d.z*3))!==layer)continue;
        const travel=time*(.16+d.z*.36),y=(frac(d.y+travel)*1.15-.075)*height;
        const x=frac(d.x-travel*.09+sim.windOffset+Math.sin(time*.15+d.phase)*.004)*1.1*width-width*.05;
        const len=(.003+d.z*.016)*height;
        ctx.moveTo(x,y);ctx.lineTo(x+len*(-.18+wind*1.35),y+len);
      }
      ctx.strokeStyle=`rgba(178,210,228,${.085+layer*.055})`;ctx.lineWidth=.45+layer*.3;ctx.stroke();
    }
  }
  function draw(){
    if(photoFlow)photoFlow.paint(time,life,width,height,ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    ctx.save();inImage();lights();traffic();craft.forEach(ship);searchlights();ctx.restore();drawRain();
  }
  function tick(now){
    if(last){const dt=Math.min((now-last)/1000,.1);sim.step(dt,{},rain);time=sim.time;wind=sim.wind;}last=now;
    if(now-lastPaint>=1000/30){draw();lastPaint=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync(){cancelAnimationFrame(frame);last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else draw();}
  function toggle(){paused=!paused;document.getElementById('playIcon').textContent=paused?'▷':'Ⅱ';document.getElementById('playText').textContent=paused?'Продолжить':'Пауза';play.setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();showControls();}
  function showControls(){if(hiddenByUser)return;controls.classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!controls.contains(document.activeElement))controls.classList.add('hidden');},5000);}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){console.info('Full-screen mode unavailable',e.message);}showControls();}
  play.addEventListener('click',toggle);
  rainControl.addEventListener('input',()=>{rain=Number(rainControl.value)/100;draw();showControls();});
  lifeControl.addEventListener('input',()=>{life=Number(lifeControl.value)/100;draw();showControls();});
  document.getElementById('fullscreen').addEventListener('click',fullscreen);
  document.addEventListener('visibilitychange',sync);window.addEventListener('resize',fit);
  document.addEventListener('pointermove',showControls,{passive:true});
  document.addEventListener('pointerdown',showControls,{passive:true});controls.addEventListener('focusin',()=>{hiddenByUser=false;showControls();});
  document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement)return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;controls.classList.toggle('hidden',hiddenByUser);if(!hiddenByUser)showControls();}});
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='nightfall:settings')return;
    const value=event.data;
    rain=Math.max(0,Math.min(1,Number(value.weather)||0));rainControl.value=rain*100;
    life=Math.max(0,Math.min(1,Number(value.life)||0));lifeControl.value=life*100;
    if(paused!==Boolean(value.paused)){paused=Boolean(value.paused);sync();}else draw();
  });
  background.onload=()=>{try{photoFlow=window.createNightfallPhotoFlow(document.getElementById('photoFlow'),background,data);draw();}catch(e){console.error(e);const notice=document.getElementById('error');notice.textContent='Не удалось запустить движение фотографии: '+e.message;notice.hidden=false;}};background.onerror=()=>document.getElementById('error').hidden=false;background.src='assets/city.png';fit();sync();showControls();
})();
