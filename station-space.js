/* Visible, measured background motion, in source-photo coordinates. The photographed
 * stars and the camera stay fixed; only dust and a faint nebula veil move. */
(() => {
  'use strict';
  const TAU=Math.PI*2, W=1672, H=941;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const fract=x=>x-Math.floor(x);
  const hash=x=>fract(Math.sin(x*127.1+311.7)*43758.5453);
  const wrap=(x,span)=>((x%span)+span)%span;
  const makeCanvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  // Thin parts missing from the broad relighting mask: piers, antennae,
  // lower fittings and the two small stationary craft in the source artwork.
  const extraForeground=[
    [[1280,0],[1394,0],[1394,132],[1270,178]],
    [[930,150],[1060,150],[1124,310],[1119,513],[930,513]],
    [[868,704],[1048,704],[1048,835],[868,835]],
    [[1060,704],[1103,708],[1167,803],[1163,851],[1133,824],[1085,760]],
    [[1333,666],[1371,666],[1506,730],[1502,760],[1452,737],[1387,706]],
    [[1459,587],[1489,588],[1629,641],[1626,677],[1581,667],[1459,620]],
    [[1250,748],[1272,748],[1308,776],[1302,794],[1274,784],[1250,765]],
    [[1522,680],[1548,683],[1587,702],[1585,722],[1559,724],[1522,702]],
    [[979,747],[1012,749],[1014,818],[987,823]],
  ];
  function polygon(ctx,points){ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();}
  function skyMask(data){
    const blocked=makeCanvas(W,H),p=blocked.getContext('2d');
    p.fillStyle='#fff';p.strokeStyle='#fff';p.lineWidth=24;p.lineJoin='round';p.lineCap='round';
    for(const piece of data.HULL_MASK){p.beginPath();polygon(p,piece.polygon);for(const hole of piece.holes||[])polygon(p,hole);p.fill('evenodd');p.stroke();}
    for(const points of extraForeground){p.beginPath();polygon(p,points);p.fill();p.stroke();}
    for(const beacon of data.BEACONS){p.beginPath();p.moveTo(beacon.x,beacon.y-35);p.lineTo(beacon.x,beacon.y+43);p.lineWidth=13;p.stroke();}
    const mask=makeCanvas(W,H),q=mask.getContext('2d');q.fillStyle='#fff';q.fillRect(0,0,W,H);
    q.globalCompositeOperation='destination-out';q.filter='blur(3px)';q.drawImage(blocked,0,0);
    q.filter='none';q.drawImage(blocked,0,0);q.globalCompositeOperation='source-over';
    return mask;
  }
  function diffuseMask(mask){
    const soft=makeCanvas(W,H),p=soft.getContext('2d');p.filter='blur(28px)';p.drawImage(mask,0,0);p.filter='none';
    const pixels=p.getImageData(0,0,W,H),hard=mask.getContext('2d').getImageData(0,0,W,H).data;
    // Diffuse haze withdraws gradually from geometry, avoiding dark cut-out
    // borders around the deliberately conservative silhouette mask.
    for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.min(hard[i],255*(pixels.data[i]/255)**4);
    p.putImageData(pixels,0,0);return soft;
  }
  const particles=Array.from({length:140},(_,i)=>{
    const near=i>=84,angle=-Math.PI+.08+(hash(i+40)-.5)*.28;
    const speed=near?3.5+hash(i+12)*4:.6+hash(i+12)*.8;
    // Put the first nearby grains in the sky visible in a narrow preview.
    // Uniform random placement otherwise hides the bright events behind the hull.
    const featured=i>=84&&i<100;
    const x=featured?450+(i-84)*51:hash(i+1)*W;
    const y=featured?52+hash(i+9)*65:hash(i+9)*H;
    return {near,x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      radius:near?.78+hash(i+22)*.52:.35+hash(i+22)*.30,
      alpha:near?.56+hash(i+19)*.26:.24+hash(i+19)*.23};
  });
  function sample(t){
    const beat=Math.floor(t/3.8),flashAge=t-beat*3.8,flashIndex=84+Math.floor(hash(beat+812)*16);
    const flash=smooth((flashAge-.6)/.3)*(1-smooth((flashAge-.9)/1.1));
    return particles.map((p,index)=>{
      const x=wrap(p.x+p.vx*t,W),y=wrap(p.y+p.vy*t,H);
      const edge=smooth(Math.min(x,W-x,y,H-y)/32);
      return {...p,x,y,alpha:p.alpha*edge,flash:index===flashIndex?flash*edge:0};
    });
  }
  function noise(x,y,seed){
    const a=Math.floor(x),b=Math.floor(y),u=smooth(fract(x)),v=smooth(fract(y));
    return (hash(a+b*157+seed)*(1-u)+hash(a+1+b*157+seed)*u)*(1-v)
      +(hash(a+(b+1)*157+seed)*(1-u)+hash(a+1+(b+1)*157+seed)*u)*v;
  }
  function nebulaTexture(){
    const canvas=makeCanvas(320,192),ctx=canvas.getContext('2d'),im=ctx.createImageData(320,192);
    for(let y=0;y<192;y++)for(let x=0;x<320;x++){
      const n=noise(x/42,y/22,13)*.52+noise(x/18,y/11,39)*.32+noise(x/7,y/5,28)*.16;
      const edge=smooth(Math.min(x,319-x)/35)*smooth(Math.min(y,191-y)/28);
      const filament=Math.max(0,n-.34)**1.35*edge,i=(y*320+x)*4;
      im.data[i]=78;im.data[i+1]=111;im.data[i+2]=164;im.data[i+3]=Math.round(255*filament);
    }
    ctx.putImageData(im,0,0);return canvas;
  }
  window.createStationSpace=data=>{
    const layer=makeCanvas(W,H),ctx=layer.getContext('2d'),mask=skyMask(data),softMask=diffuseMask(mask),veil=nebulaTexture();
    const glow=makeCanvas(32,32),g=glow.getContext('2d'),gradient=g.createRadialGradient(16,16,0,16,16,16);
    gradient.addColorStop(0,'rgba(207,222,246,.85)');gradient.addColorStop(.18,'rgba(136,170,218,.2)');gradient.addColorStop(1,'rgba(90,130,190,0)');g.fillStyle=gradient;g.fillRect(0,0,32,32);
    return {mask,canvas:layer,render(target,t){
      ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='source-over';
      // Constant one-way advection of soft tiles. Adjacent tiles have
      // transparent edges; wrapping an entire tile leaves an identical field.
      const upperOffset=wrap(t*3.1,1250),lowerOffset=wrap(-t*1.4,1000);
      for(let tile=-1;tile<2;tile++){
        ctx.globalAlpha=.30;ctx.drawImage(veil,tile*1250+upperOffset,-220,1250,620);
        ctx.globalAlpha=.18;ctx.drawImage(veil,tile*1000+lowerOffset,700,1000,400);
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(softMask,0,0);ctx.globalCompositeOperation='source-over';
      const current=sample(t);
      for(const p of current){
        if(p.alpha<=0)continue;
        if(p.near){ctx.globalAlpha=p.alpha*.2;ctx.drawImage(glow,p.x-3.5,p.y-3.5,7,7);ctx.globalAlpha=1;}
        ctx.fillStyle=`rgba(205,221,242,${Math.min(1,p.alpha+p.flash*.36)})`;
        ctx.beginPath();ctx.arc(p.x,p.y,p.radius+p.flash*.24,0,TAU);ctx.fill();
        if(p.flash>.01){ctx.globalAlpha=p.flash*.8;ctx.drawImage(glow,p.x-5,p.y-5,10,10);ctx.globalAlpha=1;}
      }
      ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over';
      target.save();target.globalCompositeOperation='screen';target.drawImage(layer,0,0);target.restore();
      return current;
    }};
  };
  window.STATION_SPACE={sample,particles,extraForeground};
})();
