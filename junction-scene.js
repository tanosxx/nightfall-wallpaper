(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('atmosphere'),ctx=canvas.getContext('2d');
  const background=document.querySelector('.city'),photo=new Image();
  const embedded=new URLSearchParams(location.search).has('embed');
  let width=innerWidth,height=innerHeight,ratio=1,sourceWidth=1,sourceHeight=1;
  let scene=null,frame,last=null,lastPaint=-Infinity,time=0,paused=false,strength=.6;
  let hideTimer,hiddenByUser=false;

  function camera(){
    const scale=Math.max(width/sourceWidth,height/sourceHeight);
    return {scale,x:(width-sourceWidth*scale)/2,y:(height-sourceHeight*scale)/2};
  }
  function draw(){
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    if(scene){
      const c=camera();ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);
      scene.render(ctx,time,strength);ctx.restore();
    }
    canvas.dataset.time=time.toFixed(4);canvas.dataset.paused=String(paused);
    canvas.dataset.ready=String(Boolean(scene));canvas.dataset.strength=strength.toFixed(3);
  }
  function tick(now){
    if(!scene||paused||document.hidden){frame=undefined;last=null;return;}
    if(last!==null)time+=Math.min(2,Math.max(0,(now-last)/1000));
    last=now;
    if(now-lastPaint>=1000/30){draw();lastPaint=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=undefined;last=null;lastPaint=-Infinity;
    draw();
    if(scene&&!paused&&!document.hidden)frame=requestAnimationFrame(tick);
  }
  function fit(){
    width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    if(scene){
      const c=camera();background.style.backgroundSize=`${sourceWidth*c.scale}px ${sourceHeight*c.scale}px`;
      background.style.backgroundPosition=`${c.x}px ${c.y}px`;
    }
    draw();
  }
  function show(){
    if(embedded||hiddenByUser)return;
    $('controls').classList.remove('hidden');clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>$('controls').classList.add('hidden'),6000);
  }
  function setPaused(value){
    paused=value;$('playIcon').textContent=paused?'▷':'Ⅱ';$('playText').textContent=paused?'Продолжить':'Пауза';
    $('play').setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');sync();
  }
  async function full(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}
    show();
  }
  $('play').addEventListener('click',()=>{setPaused(!paused);show();});
  $('rain').addEventListener('input',()=>{strength=Number($('rain').value)/100;draw();show();});
  $('fullscreen').addEventListener('click',full);
  window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);
  document.addEventListener('pointermove',show,{passive:true});
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement)return;
    if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPaused(!paused);show();}
    if(e.key.toLowerCase()==='f')full();
    if(e.key.toLowerCase()==='h'){hiddenByUser=!hiddenByUser;$('controls').classList.toggle('hidden',hiddenByUser);}
  });
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;
    const value=Number(e.data.weather);
    if(Number.isFinite(value))strength=Math.max(0,Math.min(1,value));
    $('rain').value=strength*100;
    if(paused!==Boolean(e.data.paused))setPaused(Boolean(e.data.paused));else draw();
  });
  photo.onload=async()=>{
    try{
      sourceWidth=photo.naturalWidth;sourceHeight=photo.naturalHeight;
      if(!sourceWidth||!sourceHeight)throw new Error('The scene image has no dimensions.');
      const candidate=window.createJunctionScene(photo);
      if(!candidate||typeof candidate.render!=='function')throw new Error('The scene renderer is unavailable.');
      if(candidate.ready)await candidate.ready;
      scene=candidate;
      time=0;fit();sync();
    }catch(error){scene=null;cancelAnimationFrame(frame);console.error(error);$('error').hidden=false;canvas.dataset.ready='false';}
  };
  photo.onerror=()=>$('error').hidden=false;
  fit();show();photo.src='assets/junction.png';
})();
