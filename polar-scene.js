/* Polar Signal: quiet aurora, snow and independently occupied windows. */
(() => {
  'use strict';
  const data=window.POLAR,motion=window.POLAR_MOTION.createPolarMotion(window.POLAR),canvas=document.getElementById('atmosphere'),ctx=canvas.getContext('2d');
  const $=id=>document.getElementById(id),TAU=Math.PI*2,frac=x=>x-Math.floor(x),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  let width=1,height=1,ratio=1,time=0,last=0,lastPaint=0,frame,waterPhoto=null,paused=false,weather=.7,life=1,hideTimer,hiddenByUser=false;
  const windows=motion.windows;
  const snow=Array.from({length:data.SNOW.count},()=>({x:Math.random(),y:Math.random(),depth:Math.random(),phase:Math.random()*TAU,speed:.014+Math.random()*.024,drift:-.005-Math.random()*.005}));
  function polygon(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*data.IMAGE_WIDTH,y*data.IMAGE_HEIGHT):ctx.moveTo(x*data.IMAGE_WIDTH,y*data.IMAGE_HEIGHT));ctx.closePath();}
  const auroraTextures=new Map();
  function auroraTexture(color){
    const key=color.join(',');if(auroraTextures.has(key))return auroraTextures.get(key);
    const c=document.createElement('canvas');c.width=32;c.height=256;const p=c.getContext('2d');
    const vertical=p.createLinearGradient(0,0,0,256);
    for(const[at,alpha]of [[0,0],[.16,.035],[.42,.24],[.70,.78],[.85,.51],[.96,.10],[1,0]])vertical.addColorStop(at,`rgba(${color},${alpha})`);
    p.fillStyle=vertical;p.fillRect(0,0,32,256);
    const horizontal=p.createLinearGradient(0,0,32,0);
    for(const[at,alpha]of [[0,0],[.35,1],[.65,1],[1,0]])horizontal.addColorStop(at,`rgba(255,255,255,${alpha})`);
    p.globalCompositeOperation='destination-in';p.fillStyle=horizontal;p.fillRect(0,0,32,256);
    auroraTextures.set(key,c);return c;
  }
  function aurora(){
    ctx.save();polygon(data.SKY_POLYGON);ctx.clip();
    for(const band of data.AURORA){
      const texture=auroraTexture(band.color),count=132,stripWidth=(band.right-band.left)*data.IMAGE_WIDTH/count*2.15,t=time*band.speed;
      for(let i=1;i<count;i++){
        const u=i/count,edge=Math.pow(Math.sin(Math.PI*u),.7);
        const x=(band.left+(band.right-band.left)*u)*data.IMAGE_WIDTH;
        const y=(band.y+Math.sin(u*7.7+t+band.phase)*.019+Math.sin(u*15.3-t*.63+band.phase)*.007)*data.IMAGE_HEIGHT;
        const h=band.height*data.IMAGE_HEIGHT*(.72+.18*Math.sin(u*10.1+t*.38+band.phase));
        const folds=.34+.34*Math.pow(Math.sin(u*83+t+band.phase),2)+.32*Math.pow(Math.sin(u*191-t*.43),2);
        ctx.globalAlpha=band.opacity*edge*folds*(.84+.16*Math.sin(time*.19+band.phase))*life;
        ctx.drawImage(texture,x-stripWidth/2,y-h,stripWidth,h);
      }
    }ctx.restore();
  }
  function lights(){data.WINDOWS.forEach((p,i)=>{const off=(1-windows[i].value)*(1-(p.minLight??0))*life;if(off<.005)return;const x=p.x*data.IMAGE_WIDTH,y=p.y*data.IMAGE_HEIGHT;ctx.fillStyle=`rgba(${p.offColor},${off})`;for(const[dx,dy,w,h]of p.maskRects)ctx.fillRect(x+dx,y+dy,w,h);});}
  function water(){for(const r of data.WATER){ctx.save();polygon(r.polygon);ctx.clip();const w=r.w*data.IMAGE_WIDTH,h=r.h*data.IMAGE_HEIGHT;for(let i=0;i<22;i++){const f=i/21,phase=r.phase+i*2.31,y=(r.y-r.h/2)*data.IMAGE_HEIGHT+f*h,x=r.x*data.IMAGE_WIDTH+Math.sin(time*.31+phase)*w*.12,half=w*(.08+.36*f)*(.65+.35*Math.sin(phase+time*.43)),a=(.035+.065*Math.pow(Math.sin(time*.55+phase),2))*(1-f*.68)*life;ctx.strokeStyle=`rgba(${r.color},${a})`;ctx.lineWidth=.6+f*.65;ctx.beginPath();ctx.moveTo(x-half,y);ctx.lineTo(x+half,y);ctx.stroke();}ctx.restore();}}
  function airship(s){const phase=frac(time/s.period+s.phase),progress=s.direction>0?phase:1-phase,a=Math.min(1,phase/.08,(1-phase)/.08),x=(s.left+(s.right-s.left)*progress)*data.IMAGE_WIDTH,y=(s.y+Math.sin(time*.13+s.phase)*.0025)*data.IMAGE_HEIGHT;
    ctx.save();ctx.globalAlpha=a;ctx.translate(x,y);ctx.scale(s.width*s.direction,s.width);ctx.fillStyle='#142938e6';ctx.beginPath();ctx.moveTo(-.48,0);ctx.bezierCurveTo(-.45,-.14,.30,-.16,.50,-.015);ctx.bezierCurveTo(.35,.12,-.36,.13,-.48,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#42667876';ctx.lineWidth=.012;ctx.beginPath();ctx.moveTo(-.40,-.025);ctx.bezierCurveTo(-.18,-.105,.25,-.09,.43,-.018);ctx.stroke();ctx.fillStyle='#0f1f2ef0';ctx.beginPath();ctx.moveTo(-.35,-.055);ctx.lineTo(-.48,-.20);ctx.lineTo(-.25,-.075);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-.36,.045);ctx.lineTo(-.48,.17);ctx.lineTo(-.22,.07);ctx.closePath();ctx.fill();ctx.fillRect(-.08,.075,.20,.045);ctx.fillStyle='#ffad52d9';ctx.fillRect(.01,.088,.045,.012);const blink=.35+.65*Math.pow(Math.max(0,Math.sin(time*1.5+s.phase)),10);ctx.fillStyle=`rgba(230,99,56,${blink})`;ctx.beginPath();ctx.arc(-.44,-.008,.012,0,TAU);ctx.fill();ctx.restore();}
  function snowfall(){const count=Math.round(snow.length*weather),scale=Math.max(.7,height/941);for(let layer=0;layer<3;layer++){ctx.beginPath();for(let i=0;i<count;i++){const f=snow[i];if(Math.min(2,Math.floor(f.depth*3))!==layer)continue;const x=frac(f.x+time*f.drift+Math.sin(time*.23+f.phase)*.007)*(width+20)-10,y=frac(f.y+time*f.speed*(.55+f.depth*1.3))*(height+20)-10,r=(.42+f.depth*.72)*scale;ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,TAU);}ctx.fillStyle=`rgba(201,222,237,${.20+layer*.12})`;ctx.fill();}}
  function stars(){
    (data.STARS||[]).forEach((s,i)=>{
      const gain=1+(motion.starBrightness(i)-1)*life,bg=s.backgroundColor;
      for(const[dx,dy,r,g,b]of s.originalPixels||[]){
        const rgb=[r,g,b].map((v,c)=>Math.round(clamp(bg[c]+(v-bg[c])*gain,0,255)));
        ctx.fillStyle=`rgb(${rgb})`;ctx.fillRect(s.x+dx,s.y+dy,1,1);
      }
    });
  }
  function beacons(){
    (data.BEACONS||[]).forEach((b,i)=>{
      const a=1+(motion.beaconBrightness(i)-1)*life,strength=b.strength??1;
      ctx.fillStyle=`rgba(${b.offColor},${1-a})`;
      for(const[dx,dy,w,h]of b.maskRects||[])ctx.fillRect(b.x+dx,b.y+dy,w,h);
      const r=b.haloRadius,g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,r);
      g.addColorStop(0,`rgba(${b.color},${a*.5*strength})`);g.addColorStop(.22,`rgba(${b.color},${a*.20*strength})`);g.addColorStop(1,`rgba(${b.color},0)`);
      ctx.fillStyle=g;ctx.fillRect(b.x-r,b.y-r,r*2,r*2);
      ctx.fillStyle=`rgba(255,157,118,${a*.85*strength})`;ctx.beginPath();ctx.arc(b.x,b.y,b.coreRadius*.48,0,TAU);ctx.fill();
    });
  }
  function people(){
    for(const p of [...motion.people].sort((a,b)=>a.y-b.y)){
      const stride=p.walking?Math.sin(p.stride):0,lean=p.working ? .11+.035*Math.sin(time*1.8) : 0;
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.height,p.height);
      ctx.fillStyle='#07101c4d';ctx.beginPath();ctx.ellipse(.06,.015,.28,.045,0,0,TAU);ctx.fill();
      ctx.translate(0,-Math.abs(stride)*.025);ctx.scale(p.face,1);
      ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#172332';ctx.lineWidth=.105;
      ctx.beginPath();ctx.moveTo(-.075,-.34);ctx.lineTo(-.08-stride*.11,-.17);ctx.lineTo(-.08+stride*.14,0);ctx.moveTo(.075,-.34);ctx.lineTo(.08+stride*.11,-.17);ctx.lineTo(.08-stride*.14,0);ctx.stroke();
      ctx.fillStyle=`rgb(${p.color||[99,80,63]})`;ctx.beginPath();ctx.moveTo(-.13+lean,-.74);ctx.lineTo(.13+lean,-.74);ctx.lineTo(.16,-.34);ctx.lineTo(-.16,-.34);ctx.closePath();ctx.fill();
      ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.09;ctx.beginPath();
      if(p.working){const hand=-.51+Math.sin(time*2.2+p.x)*.045;ctx.moveTo(.10+lean,-.68);ctx.lineTo(.27,-.52);ctx.lineTo(.33,hand);ctx.moveTo(-.10+lean,-.68);ctx.lineTo(.14,-.48);ctx.lineTo(.29,hand+.04);}
      else{ctx.moveTo(-.12+lean,-.68);ctx.lineTo(-.17-stride*.10,-.43);ctx.moveTo(.12+lean,-.68);ctx.lineTo(.17+stride*.10,-.43);}ctx.stroke();
      ctx.fillStyle='#182632';ctx.beginPath();ctx.arc(lean*.85,-.86,.115,0,TAU);ctx.fill();
      ctx.fillStyle='#ac8c70';ctx.beginPath();ctx.arc(.055+lean*.85,-.855,.045,0,TAU);ctx.fill();
      ctx.restore();
    }
  }
  function draw(){
    if(waterPhoto)waterPhoto.paint(time,life,width,height,ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const scale=Math.max(width/data.IMAGE_WIDTH,height/data.IMAGE_HEIGHT);
    ctx.save();ctx.translate((width-data.IMAGE_WIDTH*scale)/2,(height-data.IMAGE_HEIGHT*scale)/2);ctx.scale(scale,scale);
    stars();aurora();water();lights();beacons();people();data.AIRSHIPS.forEach(airship);ctx.restore();snowfall();
  }
  function update(dt){motion.update(dt);time=motion.time;}
  function tick(now){if(last)update(Math.min(.1,(now-last)/1000));last=now;if(now-lastPaint>=1000/30){draw();lastPaint=now;}frame=requestAnimationFrame(tick);}
  function sync(){cancelAnimationFrame(frame);last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else draw();}
  function fit(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);draw();}
  function show(){if(hiddenByUser)return;$('controls').classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>$('controls').classList.add('hidden'),5000);}
  function toggle(){paused=!paused;$('playIcon').textContent=paused?'▷':'Ⅱ';$('playText').textContent=paused?'Продолжить':'Пауза';$('play').setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();show();}
  async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}show();}
  $('play').addEventListener('click',toggle);$('rain').addEventListener('input',()=>{weather=Number($('rain').value)/100;draw();show();});$('life').addEventListener('input',()=>{life=Number($('life').value)/100;draw();show();});$('fullscreen').addEventListener('click',full);window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);document.addEventListener('pointermove',show,{passive:true});document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement)return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.key.toLowerCase()==='f')full();if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;$('controls').classList.toggle('hidden',hiddenByUser);}});
  window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;weather=clamp(Number(e.data.weather)||0,0,1);life=clamp(Number(e.data.life)||0,0,1);$('rain').value=weather*100;$('life').value=life*100;if(paused!==Boolean(e.data.paused)){paused=Boolean(e.data.paused);sync();}else draw();});
  const picture=new Image();picture.onload=()=>{try{waterPhoto=window.createPolarWater($('photo-water'),picture,data);draw();}catch(error){console.error(error);$('photo-water').hidden=true;$('error').textContent='Движение воды недоступно: '+error.message;$('error').hidden=false;}};picture.onerror=()=>$('error').hidden=false;picture.src='assets/polar.png';fit();sync();show();
})();
