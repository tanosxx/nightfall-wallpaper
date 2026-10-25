/* Photographic station preview; measured geometry is preserved from V10. */
(() => {
  'use strict';
  const data=window.STATION,motion=window.STATION_MOTION.createStationMotion({...data,HANGAR:{...data.HANGAR,workers:[]}}),lighting=window.STATION_LIGHTING.createStationLighting();
  const $=id=>document.getElementById(id),canvas=$('atmosphere'),ctx=canvas.getContext('2d'),background=document.querySelector('.city');
  const W=data.IMAGE_WIDTH,H=data.IMAGE_HEIGHT,TAU=Math.PI*2,hangar=data.HANGAR;
  let width=1,height=1,ratio=1,last=0,lastPaint=0,frame,paused=false,intensity=1;
  let occluders=null,relief=null,illuminatedPlate=null,practicalPools=[],hideTimer,hiddenByUser=false,receivedSettings=false;
  const photo=new Image(),textures=new Map(),industrial=window.createStationIndustrial(),space=window.createStationSpace(data);

  function path(p,points){p.beginPath();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();}
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
      glow(b.x,b.y,(b.haloRadius??7)*1.15,b.color,value*strength*.72*lighting.state.exteriorGain);
      ellipse(b.x,b.y,b.coreRadius??.9,b.coreRadius??.9,`rgba(${b.color},${value*strength})`);
    });
  }
  function sequence(){
    (data.SEQUENCE_LIGHTS||[]).forEach((s,i)=>s.points.forEach(([x,y],j)=>{
      const value=motion.sequenceBrightness(i,j),r=s.radius??1;
      glow(x,y,r*4,s.color,value*.42*lighting.state.exteriorGain);ellipse(x,y,r,r,`rgba(${s.color},${.15+.85*value})`);
    }));
  }
  function reflections(p=ctx){
    if(!relief)return;
    window.STATION_RELIEF.welds.forEach((map,i)=>{const alpha=Math.min(1,(motion.welders[i]?.brightness||0)*lighting.state.weldGain);if(alpha>0){p.save();p.globalCompositeOperation='lighter';p.globalAlpha=alpha;p.drawImage(relief.welds[i],map.x,map.y);p.restore();}});
  }
  function practicalLights(p){
    p.save();p.globalCompositeOperation='lighter';
    practicalPools.forEach((pool,i)=>{p.globalAlpha=Math.min(.7,motion.workLights[i].brightness*lighting.state.workLightGain);p.drawImage(pool.texture,pool.x,pool.y);});p.restore();
  }
  function preparePracticalLights(){
    practicalPools=(hangar.workLights||[]).map(lamp=>{
      const points=lamp.floorPolygon,x=Math.floor(Math.min(...points.map(p=>p[0]))-3),y=Math.floor(Math.min(...points.map(p=>p[1]))-3),w=Math.ceil(Math.max(...points.map(p=>p[0]))-x+3),h=Math.ceil(Math.max(...points.map(p=>p[1]))-y+3);
      const mask=Object.assign(document.createElement('canvas'),{width:w,height:h}),p=mask.getContext('2d');
      p.translate(-x,-y);path(p,points);p.clip();
      const cx=points.reduce((a,v)=>a+v[0]/points.length,0),cy=points.reduce((a,v)=>a+v[1]/points.length,0),g=p.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)*.52);
      g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.5,'rgba(255,255,255,.23)');g.addColorStop(1,'rgba(255,255,255,0)');p.fillStyle=g;p.fillRect(x,y,w,h);
      return{x,y,texture:window.createStationMaterialIncrement(photo,mask,{x,y},lamp.color.map(v=>v/255),.75)};
    });
  }
  function welding(){
    for(const w of motion.welders){
      const [x,y]=w.tool;
      if(w.brightness>0){
        glow(x,y,Math.max(4,w.height*.8),[119,198,239],w.brightness*.30*lighting.state.weldGain);
        ellipse(x,y,.65,.65,`rgba(217,242,255,${w.brightness})`);
      }
      for(const spark of w.sparks){line([[spark.x,spark.y],[spark.x-Math.cos(spark.angle)*spark.length,spark.y-Math.sin(spark.angle)*spark.length]],`rgba(255,${Math.round(105+125*(spark.heat??.6))},${Math.round(28+155*(spark.heat??.6))},${spark.alpha*.9})`,.55);}
    }
  }
  function hangarLife(){
    ctx.save();path(ctx,hangar.aperture);ctx.clip();
    industrial.machinery(ctx,motion.activityTime,lighting.state);
    if(occluders)ctx.drawImage(occluders,0,0);welding();ctx.restore();
  }
  function camera(){
    const scale=Math.max(width/W,height/H);
    return {scale,x:(width-W*scale)/2,y:(height-H*scale)/2};
  }
  function draw(){
    canvas.dataset.mode=lighting.targetMode;canvas.dataset.transition=String(lighting.state.transition);canvas.dataset.time=String(motion.time);canvas.dataset.weld=motion.welders.map(w=>w.brightness.toFixed(5)).join(',');
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const c=camera();ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);
    if(relief){relief.render(lighting.state);const p=illuminatedPlate.getContext('2d');p.globalCompositeOperation='copy';p.drawImage(relief.canvas,0,0);p.globalCompositeOperation='source-over';practicalLights(p);reflections(p);occluders=cutout(hangar?.occluders||[]);ctx.drawImage(illuminatedPlate,0,0);}
    space.render(ctx,motion.time);canvas.dataset.spaceTime=String(motion.time);
    lights();beacons();sequence();industrial.neon(ctx,motion,lighting.state);industrial.rotor(ctx,motion.activityTime);if(hangar)hangarLife();
    canvas.dataset.steam=String(industrial.steam(ctx,motion.activityTime,intensity));canvas.dataset.workers='0';
    canvas.dataset.mechanism=String(industrial.carriagePosition(motion.activityTime));ctx.restore();
  }
  function positionPhoto(){const c=camera();background.style.backgroundSize=`${W*c.scale}px ${H*c.scale}px`;background.style.backgroundPosition=`${c.x}px ${c.y}px`;}
  function tick(now){
    if(last){
      // Embedded previews may deliver only one RAF per second. Advance all
      // clocks by elapsed time, in bounded simulation steps, instead of losing
      // 90% of each interval. sync() resets last after pause/visibility changes.
      let remaining=Math.min(2,Math.max(0,(now-last)/1000));
      while(remaining>1e-8){const step=Math.min(.1,remaining);motion.update(step,intensity);lighting.update(step);remaining-=step;}
    }last=now;
    if(now-lastPaint>=1000/30){draw();lastPaint=now;}frame=requestAnimationFrame(tick);
  }
  function sync(){cancelAnimationFrame(frame);last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else draw();}
  function fit(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);positionPhoto();draw();}
  function show(){if(hiddenByUser)return;$('controls').classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>$('controls').classList.add('hidden'),5000);}
  function mode(id,immediate=paused){if(lighting.setMode(id,immediate)){for(const b of $('stationModes').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===id));draw();}}
  for(const b of $('stationModes').querySelectorAll('button'))b.addEventListener('click',()=>{mode(b.dataset.mode);show();});
  function toggle(){paused=!paused;$('playIcon').textContent=paused?'▷':'Ⅱ';$('playText').textContent=paused?'Продолжить':'Пауза';$('play').setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();show();}
  async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}show();}
  $('play').addEventListener('click',toggle);$('rain').addEventListener('input',()=>{intensity=Number($('rain').value)/100;motion.update(0,intensity);draw();show();});$('fullscreen').addEventListener('click',full);
  window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);document.addEventListener('pointermove',show,{passive:true});
  document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();toggle();}if(e.key.toLowerCase()==='f')full();if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;$('controls').classList.toggle('hidden',hiddenByUser);}});
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;
    const nextIntensity=Math.max(0,Math.min(1,Number(e.data.weather)||0));intensity=nextIntensity;$('rain').value=intensity*100;motion.update(0,intensity);
    if(e.data.stationMode&&(!receivedSettings||e.data.stationMode!==lighting.targetMode))mode(e.data.stationMode,!receivedSettings||Boolean(e.data.paused));
    receivedSettings=true;
    if(paused!==Boolean(e.data.paused)){paused=Boolean(e.data.paused);sync();}else draw();
  });
  photo.onload=async()=>{occluders=cutout(hangar?.occluders||[]);draw();try{relief=await window.createStationRelief(photo,window.STATION_RELIEF);illuminatedPlate=Object.assign(document.createElement('canvas'),{width:W,height:H});preparePracticalLights();document.documentElement.dataset.stationRenderer=relief.backend;draw();}catch(error){console.error(error);$('error').textContent='Объёмное освещение не загрузилось. Проверьте полноту папки обоев.';$('error').hidden=false;}};
  photo.onerror=()=>$('error').hidden=false;photo.src='assets/station.png';
  fit();sync();show();
})();
