/* Station life shares measured geometry and simulation with the GNOME renderer. */
(() => {
  'use strict';
  const data=window.STATION,motion=window.STATION_MOTION.createStationMotion(data),lighting=window.STATION_LIGHTING.createStationLighting();
  const $=id=>document.getElementById(id),canvas=$('atmosphere'),ctx=canvas.getContext('2d'),background=document.querySelector('.city');
  const W=data.IMAGE_WIDTH,H=data.IMAGE_HEIGHT,TAU=Math.PI*2,hangar=data.HANGAR;
  let width=1,height=1,ratio=1,last=0,lastPaint=0,frame,paused=false,intensity=1;
  let occluders=null,relief=null,illuminatedPlate=null,relightTime=-1,hideTimer,hiddenByUser=false,receivedSettings=false;
  const photo=new Image(),textures=new Map();

  function path(p,points){p.beginPath();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();}
  function shape(points,color){path(ctx,points);ctx.fillStyle=color;ctx.fill();}
  function line(points,color,width){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
  function cutout(parts){
    const result=occluders||document.createElement('canvas');if(result.width!==W||result.height!==H){result.width=W;result.height=H;}
    const p=result.getContext('2d');p.globalCompositeOperation='source-over';p.clearRect(0,0,W,H);p.fillStyle='#fff';
    for(const part of parts){path(p,part.polygon);p.fill();}
    p.globalCompositeOperation='source-in';p.drawImage(illuminatedPlate||relief?.canvas||photo,0,0);return result;
  }
  function glow(x,y,r,color,alpha){
    if(alpha<=0||r<=0)return;
    const key=color.join(',');let texture=textures.get(key);
    if(!texture){
      texture=document.createElement('canvas');texture.width=64;texture.height=64;
      const p=texture.getContext('2d'),g=p.createRadialGradient(32,32,0,32,32,31);
      g.addColorStop(0,`rgba(${color},.8)`);g.addColorStop(.2,`rgba(${color},.24)`);g.addColorStop(1,`rgba(${color},0)`);
      p.fillStyle=g;p.fillRect(0,0,64,64);textures.set(key,texture);
    }
    ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(texture,x-r,y-r,r*2,r*2);ctx.restore();
  }
  function lights(){
    data.STATION_LIGHTS.forEach((p,i)=>{
      const off=(1-Math.min(1,motion.windows[i].value*lighting.state.windowFactor))*(1-(p.minLight??0));
      if(off<.004)return;
      ctx.fillStyle=`rgba(${p.offColor},${off})`;
      for(const[dx,dy,w,h]of p.maskRects)ctx.fillRect(p.x+dx,p.y+dy,w,h);
    });
  }
  function beacons(){
    (data.BEACONS||[]).forEach((b,i)=>{
      const value=motion.beaconBrightness(i),strength=b.strength??1;
      ctx.fillStyle=`rgba(${b.offColor||[17,22,28]},${1-value})`;
      for(const[dx,dy,w,h]of b.maskRects||[])ctx.fillRect(b.x+dx,b.y+dy,w,h);
      glow(b.x,b.y,b.haloRadius??7,b.color,value*strength*.8);
      ellipse(b.x,b.y,b.coreRadius??.9,b.coreRadius??.9,`rgba(${b.color},${value*strength})`);
    });
  }
  function sequence(){
    (data.SEQUENCE_LIGHTS||[]).forEach((s,i)=>s.points.forEach(([x,y],j)=>{
      const value=motion.sequenceBrightness(i,j),r=s.radius??1;
      glow(x,y,r*4,s.color,value*.5);ellipse(x,y,r,r,`rgba(${s.color},${.15+.85*value})`);
    }));
  }
  function worker(w,welding=false){
    const h=w.height,face=w.heading??(w.tool?.[0]<w.x?-1:1),stride=w.stride??0;
    const working=w.working||welding,armPhase=w.armPhase??motion.activityTime*2+(w.phase??0),lean=working?.035:0;
    const color=w.color??[149,123,75],rgb=c=>`rgb(${c})`;
    ellipse(w.x,w.y+h*.015,h*.27,h*.075,'rgba(9,12,15,.33)');
    ctx.save();ctx.translate(w.x,w.y);ctx.scale(face*h,h);ctx.lineCap='round';
    line([[-.07,-.39],[-.10-stride*.06,-.18],[-.09-stride*.13,-.015]],'#272e32',.09);
    line([[.06,-.39],[.09+stride*.06,-.18],[.09+stride*.13,-.015]],'#383e41',.09);
    line([[-.12-stride*.13,-.01],[-.05-stride*.13,-.01]],'#181d20',.085);
    line([[.06+stride*.13,-.01],[.14+stride*.13,-.01]],'#181d20',.085);
    shape([[-.11+lean,-.72],[.10+lean,-.72],[.12,-.39],[-.12,-.39]],rgb(color));
    line([[-.07+lean,-.65],[-.15,-.51],[-.15-stride*.10,-.40]],rgb(color.map(v=>v*.7)),.075);
    const hand=working?[.25+Math.sin(armPhase)*.025,-.54+Math.cos(armPhase)*.035]:[.16+stride*.10,-.40];
    line([[.08+lean,-.65],[.18,-.55],hand],rgb(color),.08);
    line([[-.075,-.55],[.075,-.55]],'#c3b877',.035);
    ellipse(lean,-.82,.083,.083,'#7a7361');
    ctx.fillStyle='#b8ad80';ctx.beginPath();ctx.arc(lean,-.86,.10,Math.PI,TAU);ctx.fill();
    line([[-.11+lean,-.855],[.12+lean,-.855]],'#bfb47f',.035);
    if(welding){ctx.fillStyle='#293338';ctx.fillRect(.025,-.85,.09,.12);}
    ctx.restore();
    if(welding)line([[w.x+face*h*.25,w.y-h*.54],w.tool],'#4d5457',Math.max(.45,h*.055));
  }
  function reflections(p=ctx){
    if(!relief)return;
    window.STATION_RELIEF.welds.forEach((map,i)=>{const alpha=Math.min(1,(motion.welders[i]?.brightness||0)*.28*lighting.state.weldGain);if(alpha>0){p.save();p.globalAlpha=alpha;p.drawImage(relief.welds[i],map.x,map.y);p.restore();}});
  }
  function floorLights(){
    (hangar.workLights||[]).forEach((lamp,i)=>{
      const value=motion.workLights[i].brightness;if(value<=0)return;
      ctx.save();
      if(lamp.floorPolygon){path(ctx,lamp.floorPolygon);ctx.clip();}
      glow(lamp.x,lamp.y,lamp.radius,lamp.color,value*.24);ctx.restore();
      glow(lamp.x,lamp.y,3,lamp.color,value*.28);
    });
  }
  function welding(){
    for(const w of motion.welders){
      const [x,y]=w.tool;
      if(w.brightness>0){
        glow(x,y,Math.max(4,w.height*.8),[119,198,239],w.brightness*.48);
        ellipse(x,y,.65,.65,`rgba(217,242,255,${w.brightness})`);
      }
      for(const spark of w.sparks){line([[spark.x,spark.y],[spark.x-Math.cos(spark.angle)*spark.length,spark.y-Math.sin(spark.angle)*spark.length]],`rgba(255,179,79,${spark.alpha*.9})`,.55);}
    }
  }
  function hangarLife(){
    ctx.save();path(ctx,hangar.aperture);ctx.clip();floorLights();
    const actors=[...motion.workers.map(a=>({kind:'worker',a})),...motion.welders.map(a=>({kind:'welder',a}))].sort((a,b)=>a.a.y-b.a.y);
    for(const {kind,a} of actors)worker(a,kind==='welder');
    if(occluders)ctx.drawImage(occluders,0,0);welding();ctx.restore();
  }
  function camera(){
    const scale=Math.max(width/W,height/H);
    return {scale,x:(width-W*scale)/2,y:(height-H*scale)/2};
  }
  function draw(){
    canvas.dataset.mode=lighting.targetMode;canvas.dataset.transition=String(lighting.state.transition);canvas.dataset.time=String(motion.time);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const c=camera();ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);
    if(relief){if(relightTime<0||lighting.time-relightTime>=1/12){relief.render(lighting.state);const p=illuminatedPlate.getContext('2d');p.drawImage(relief.canvas,0,0);reflections(p);occluders=cutout(hangar?.occluders||[]);relightTime=lighting.time;}ctx.drawImage(illuminatedPlate,0,0);}
    lights();beacons();sequence();if(hangar)hangarLife();ctx.restore();
  }
  function positionPhoto(){const c=camera();background.style.backgroundSize=`${W*c.scale}px ${H*c.scale}px`;background.style.backgroundPosition=`${c.x}px ${c.y}px`;}
  function tick(now){
    if(last){const dt=Math.min(.1,(now-last)/1000);motion.update(dt,intensity);lighting.update(dt);}last=now;
    if(now-lastPaint>=1000/30){draw();lastPaint=now;}frame=requestAnimationFrame(tick);
  }
  function sync(){cancelAnimationFrame(frame);last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else draw();}
  function fit(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);positionPhoto();draw();}
  function show(){if(hiddenByUser)return;$('controls').classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>$('controls').classList.add('hidden'),5000);}
  function mode(id,immediate=paused){if(lighting.setMode(id,immediate)){for(const b of $('stationModes').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===id));relightTime=-1;draw();}}
  for(const b of $('stationModes').querySelectorAll('button'))b.addEventListener('click',()=>{mode(b.dataset.mode);show();});
  function toggle(){paused=!paused;$('playIcon').textContent=paused?'▷':'Ⅱ';$('playText').textContent=paused?'Продолжить':'Пауза';$('play').setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();show();}
  async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}show();}
  $('play').addEventListener('click',toggle);$('rain').addEventListener('input',()=>{intensity=Number($('rain').value)/100;motion.update(0,intensity);relightTime=-1;draw();show();});$('fullscreen').addEventListener('click',full);
  window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);document.addEventListener('pointermove',show,{passive:true});
  document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();toggle();}if(e.key.toLowerCase()==='f')full();if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;$('controls').classList.toggle('hidden',hiddenByUser);}});
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;
    const nextIntensity=Math.max(0,Math.min(1,Number(e.data.weather)||0));if(nextIntensity!==intensity)relightTime=-1;intensity=nextIntensity;$('rain').value=intensity*100;motion.update(0,intensity);
    if(e.data.stationMode&&(!receivedSettings||e.data.stationMode!==lighting.targetMode))mode(e.data.stationMode,!receivedSettings||Boolean(e.data.paused));
    receivedSettings=true;
    if(paused!==Boolean(e.data.paused)){paused=Boolean(e.data.paused);sync();}else draw();
  });
  photo.onload=async()=>{occluders=cutout(hangar?.occluders||[]);draw();try{relief=await window.createStationRelief(photo,window.STATION_RELIEF);illuminatedPlate=Object.assign(document.createElement('canvas'),{width:W,height:H});relightTime=-1;document.documentElement.dataset.stationRenderer=relief.backend;draw();}catch(error){console.error(error);$('error').textContent='Объёмное освещение не загрузилось. Проверьте полноту папки обоев.';$('error').hidden=false;}};
  photo.onerror=()=>$('error').hidden=false;photo.src='assets/station.png';
  fit();sync();show();
})();
