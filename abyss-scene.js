(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('atmosphere'),ctx=canvas.getContext('2d'),background=document.querySelector('.city'),photo=new Image();
  const W=1672,H=941;let width=innerWidth,height=innerHeight,ratio=1,frame,last=null,lastPaint=0,time=0,waterTime=0,paused=false,strength=.7,water,lighting,elevator,interior,transit,hideTimer,hiddenByUser=false;
  const embedded=new URLSearchParams(location.search).has('embed');
  function camera(){const scale=Math.max(width/W,height/H);return {scale,x:(width-W*scale)/2,y:(height-H*scale)/2};}
  function draw(){
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    if(water&&lighting&&elevator&&interior&&transit){const c=camera();ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);lighting.render(ctx,time);water.refract(ctx,waterTime,lighting.canvas);elevator.render(ctx,time);interior.render(ctx,time);transit.render(ctx,time);water.particles(ctx,waterTime,strength);ctx.restore();}
    canvas.dataset.time=time.toFixed(4);canvas.dataset.waterTime=waterTime.toFixed(4);canvas.dataset.paused=String(paused);canvas.dataset.ready=String(Boolean(water&&lighting&&elevator&&interior&&transit));
    if(elevator){const s=window.ABYSS_ELEVATOR.sample(time);canvas.dataset.elevatorY=s.y.toFixed(2);canvas.dataset.elevatorMoving=String(s.moving);}
  }
  function tick(now){
    if(last!==null){const dt=Math.min(2,Math.max(0,(now-last)/1000));time+=dt;waterTime+=dt*(.35+strength*1.15);}last=now;
    if(now-lastPaint>=1000/30){draw();lastPaint=now;}frame=requestAnimationFrame(tick);
  }
  function sync(){cancelAnimationFrame(frame);last=null;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else draw();}
  function fit(){width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);const c=camera();background.style.backgroundSize=`${W*c.scale}px ${H*c.scale}px`;background.style.backgroundPosition=`${c.x}px ${c.y}px`;draw();}
  function show(){if(embedded||hiddenByUser)return;$('controls').classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>$('controls').classList.add('hidden'),6000);}
  function setPaused(value){paused=value;$('playIcon').textContent=paused?'▷':'Ⅱ';$('playText').textContent=paused?'Продолжить':'Пауза';$('play').setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();}
  async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}show();}
  $('play').addEventListener('click',()=>{setPaused(!paused);show();});$('current').addEventListener('input',()=>{strength=Number($('current').value)/100;draw();show();});$('fullscreen').addEventListener('click',full);
  window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);document.addEventListener('pointermove',show,{passive:true});
  document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPaused(!paused);show();}if(e.key.toLowerCase()==='f')full();if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;$('controls').classList.toggle('hidden',hiddenByUser);}});
  window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;const value=Number(e.data.weather);if(Number.isFinite(value))strength=Math.max(0,Math.min(1,value));$('current').value=strength*100;if(paused!==Boolean(e.data.paused))setPaused(Boolean(e.data.paused));else draw();});
  photo.onload=()=>{try{water=window.createAbyssWater(photo);lighting=window.createAbyssLighting(photo);elevator=window.createAbyssElevator(photo);interior=window.createAbyssInterior(photo);transit=window.createAbyssTransit(photo);draw();}catch(error){console.error(error);$('error').hidden=false;}};
  photo.onerror=()=>$('error').hidden=false;photo.src='assets/abyss.png';fit();sync();show();
})();
