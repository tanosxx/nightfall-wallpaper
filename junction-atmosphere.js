/* Advected steam on local clean plates; source-colour neon, never dark boxes. */
(() => {
  'use strict';
  const {W,H,vents,neon}=window.JUNCTION_DATA,TAU=Math.PI*2;
  const hash=n=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a);};
  const mod=(a,n)=>(a%n+n)%n;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const assetRoot=typeof document!=='undefined'?new URL('.',document.currentScript.src):null;
  // These local regions remove painted steam only. The rest of the source
  // remains byte-for-byte the original image under the other scene layers.
  const cleanRegions=[
    {x:260,y:59,w:151,h:124,cx:325,cy:121,rx:77,ry:61,feather:.20},
    {x:354,y:143,w:96,h:169,cx:402,cy:225,rx:48,ry:85,feather:.25},
    {x:1119,y:64,w:103,h:114,cx:1170,cy:122,rx:51,ry:57,feather:.23},
    {x:1466,y:474,w:85,h:91,cx:1507,cy:521,rx:42,ry:45,feather:.28},
  ];
  const steamSources=vents.map((v,i)=>({...v,
    radius:[21,25,22,17,13][i],rise:[103,119,109,75,62][i],
    drift:[53,61,49,36,28][i],life:[10.4,12.6,11.2,8.8,9.5][i],
    alpha:[.72,.61,.69,.62,.45][i]}));
  steamSources.push({x:397,y:273,radius:20,rise:106,drift:35,life:12.1,alpha:.51});
  const drops=Array.from({length:440},(_,i)=>({x:hash(i+81)*W,y:hash(i+701)*H,
    speed:145+hash(i+190)*240,length:5+hash(i+399)*15,
    alpha:.025+hash(i+448)*.075,width:i%7===0?.7:.45}));
  function rainAt(i,time){
    const d=drops[i],y=mod(d.y+time*d.speed,H+35)-20;
    return {...d,x:mod(d.x-time*d.speed*.075,W+35)-15,y};
  }
  function steamAt(ventIndex,i,time){
    const v=steamSources[ventIndex],seed=ventIndex*41+i,life=v.life*(.85+hash(seed+30)*.3);
    const age=mod(time+(i/10+hash(seed+91)*.045)*life,life),u=age/life;
    // Positive wind throughout. Rotation and widening create eddies inside
    // each parcel rather than making the whole plume rock back and forth.
    return {x:v.x+v.drift*u+Math.sin(u*4+seed)*u*3,
      y:v.y-v.rise*u,radius:v.radius*(.40+1.65*u),rotation:(hash(seed+77)-.5)*.4+u*.65,
      stretch:1+.19*Math.sin(u*4+seed),
      alpha:v.alpha*smooth(u*9)*smooth((1-u)*2.4),age,u,life};
  }
  function neonAt(i,time){
    const period=19.7+i*5.61,phase=mod(time-(.7+i*1.43),period);
    let brightness=1;
    if(phase<.09)brightness=.15;
    else if(phase<.21)brightness=.86;
    else if(phase<.29)brightness=.12;
    else if(phase<.43)brightness=.73;
    else if(phase<1.6+i*.11)brightness=.10+.025*Math.sin(phase*7);
    else if(phase<1.78+i*.11)brightness=.22;
    else if(phase<2.14+i*.11)brightness=.22+.78*smooth((phase-1.78-i*.11)/.36);
    return {brightness,phase,period};
  }
  window.JUNCTION_ATMOSPHERE={rainAt,steamAt,neonAt,drops,cleanRegions,steamSources};
  window.createJunctionAtmosphere=photo=>{
    const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
    function noise(x,y,seed){
      const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
      const n=(a,b)=>hash(a*7.13+b*83.7+seed*137);
      return (n(ix,iy)*(1-fx)+n(ix+1,iy)*fx)*(1-fy)+(n(ix,iy+1)*(1-fx)+n(ix+1,iy+1)*fx)*fy;
    }
    const plumes=Array.from({length:7},(_,n)=>{
      const canvas=make(128,128),c=canvas.getContext('2d'),pixels=c.createImageData(128,128);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const nx=(x-63.5)/63.5,ny=(y-63.5)/63.5;
        const warp=noise(x/37,y/37,n+37),r=Math.hypot(nx,ny);
        const body=smooth((1-r)/.43);
        const density=noise(x/28+warp*2,y/28,n)*.5+noise(x/12,y/12,n+19)*.31+noise(x/5.2,y/5.2,n+33)*.19;
        const opacity=smooth((density-.27)/.42)*body;
        const shade=129+noise(x/42,y/42,n+92)*52,offset=(y*128+x)*4;
        pixels.data[offset]=shade*.88;pixels.data[offset+1]=shade;
        pixels.data[offset+2]=Math.min(220,shade*1.08);
        pixels.data[offset+3]=Math.round(opacity*187);
      }
      c.putImageData(pixels,0,0);return canvas;
    });
    let cleanPatches=[];
    const cleanPhoto=new Image(),ready=new Promise((resolve,reject)=>{
      cleanPhoto.onload=()=>{
        cleanPatches=cleanRegions.map(n=>{
          const canvas=make(n.w,n.h),c=canvas.getContext('2d');
          c.drawImage(cleanPhoto,n.x,n.y,n.w,n.h,0,0,n.w,n.h);
          const pixels=c.getImageData(0,0,n.w,n.h);
          for(let y=0;y<n.h;y++)for(let x=0;x<n.w;x++){
            const radius=Math.hypot((n.x+x-n.cx)/n.rx,(n.y+y-n.cy)/n.ry);
            pixels.data[(y*n.w+x)*4+3]=Math.round(255*smooth((1-radius)/n.feather));
          }
          c.putImageData(pixels,0,0);return canvas;
        });resolve();
      };
      cleanPhoto.onerror=()=>reject(new Error('Cannot load junction clean plate.'));
    });
    cleanPhoto.src=new URL('assets/junction-clean-plate.png',assetRoot).href;
    // Only source cyan emission is dimmed. Brick, glass frames and neutral
    // reflections retain their original pixels, even at the darkest phase.
    const emitters=neon.map(n=>{
      const c=make(n.w,n.h),p=c.getContext('2d');
      p.drawImage(photo,n.x,n.y,n.w,n.h,0,0,n.w,n.h);
      const pixels=p.getImageData(0,0,n.w,n.h),dim=make(n.w,n.h),d=dim.getContext('2d');
      const dimPixels=d.createImageData(n.w,n.h);
      for(let i=0;i<pixels.data.length;i+=4){
        const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
        const mask=smooth((Math.min(g,b)-r-8)/45)*smooth((g+b-75)/130);
        pixels.data[i+3]=Math.round(255*mask);
        dimPixels.data[i]=Math.max(9,r*.66);
        dimPixels.data[i+1]=Math.max(17,g*.16,r*.78);
        dimPixels.data[i+2]=Math.max(23,b*.19,r*.91);
        dimPixels.data[i+3]=Math.round(255*mask);
      }
      p.putImageData(pixels,0,0);d.putImageData(dimPixels,0,0);return {emission:c,dim};
    });
    function renderBase(ctx,time){
      ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      for(let i=0;i<cleanPatches.length;i++)ctx.drawImage(cleanPatches[i],cleanRegions[i].x,cleanRegions[i].y);
      for(let i=0;i<neon.length;i++){
        const brightness=neonAt(i,time).brightness;
        if(brightness<.999){ctx.globalAlpha=1-brightness;ctx.drawImage(emitters[i].dim,neon[i].x,neon[i].y);}
      }
      ctx.restore();
    }
    function render(ctx,time,strength=.6){
      time=Number.isFinite(time)?Math.max(0,time):0;strength=Math.max(0,Math.min(1,strength));
      ctx.save();ctx.globalCompositeOperation='source-over';
      for(let v=0;v<steamSources.length;v++)for(let i=0;i<10;i++){
        const p=steamAt(v,i,time);if(p.alpha<.002)continue;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
        ctx.globalAlpha=p.alpha*(.85+strength*.25);
        ctx.scale(p.stretch,1/p.stretch);
        ctx.drawImage(plumes[(i+v*3)%plumes.length],-p.radius,-p.radius,p.radius*2,p.radius*2);ctx.restore();
      }
      ctx.globalCompositeOperation='screen';
      for(let i=0;i<neon.length;i++){
        const n=neon[i],power=neonAt(i,time).brightness;
        ctx.globalAlpha=(.06+.06*(.5+.5*Math.sin(time*(.19+i*.012)+n.phase)))*power;
        ctx.drawImage(emitters[i].emission,n.x,n.y);
      }
      ctx.globalCompositeOperation='source-over';ctx.lineCap='round';
      const count=Math.round(drops.length*strength);
      for(let i=0;i<count;i++){
        const d=rainAt(i,time);ctx.strokeStyle=`rgba(176,204,216,${d.alpha})`;ctx.lineWidth=d.width;
        ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-d.length*.075,d.y+d.length);ctx.stroke();
      }
      ctx.restore();
    }
    return {ready,renderBase,render,getDiagnostics:()=>({cleanPatches:cleanPatches.length,
      sources:steamSources.length,parcels:steamSources.length*10,neon:neon.length})};
  };
})();
