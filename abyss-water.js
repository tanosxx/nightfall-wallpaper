/* Fixed-camera water: depth-separated suspended sediment and tiny vent bubbles. */
(() => {
  'use strict';
  const W=1672,H=941,TAU=Math.PI*2;
  const hash=n=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a);};
  const mod=(a,n)=>(a%n+n)%n;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  // Only open water is refracted. Solid structures, cliff edges and masts stay fixed.
  const waterRegions=[
    [[210,3],[957,3],[958,124],[820,177],[793,218],[652,224],[629,304],[466,307],[433,366],[377,362],[300,288],[252,174]],
    [[280,405],[415,421],[423,489],[353,581],[366,648],[431,689],[504,760],[513,785],[381,734],[292,649],[242,548]],
    [[565,531],[633,541],[640,662],[719,744],[737,818],[650,793],[571,762],[544,682]],
    [[1060,3],[1277,3],[1239,87],[1218,111],[1119,94],[1064,117]]
  ];
  const grains=Array.from({length:196},(_,i)=>({
    near:i>=154,x:hash(i+1)*W,y:hash(i+205)*H,
    speed:(i>=154?8:2)+hash(i+310)*(i>=154?9:4),
    radius:(i>=154?.7:.3)+hash(i+400)*(i>=154?.95:.5),
    alpha:(i>=154?.22:.10)+hash(i+520)*(i>=154?.22:.15),phase:hash(i+607)*TAU
  }));
  // A few foreground grains cross the open water in the common narrow preview crop.
  for(let i=154;i<166;i++){grains[i].x=530+(i-154)*45;grains[i].y=70+hash(i+11)*90;}
  function particleAt(i,time){const p=grains[i];const x=mod(p.x+time*p.speed,W),y=mod(p.y-time*(p.near?.7:.22)+Math.sin(time*.12+p.phase)*(p.near?3:1.2),H);return {...p,x,y,alpha:p.alpha*smooth(Math.min(x,W-x,y,H-y)/32)};}
  const vents=[[807,502],[1262,498],[595,440]];
  function bubbleAt(i,time){
    const v=vents[i%vents.length],duration=13+hash(i+51)*9;
    const age=mod(time+hash(i+72)*duration,duration),u=age/duration;
    return {x:v[0]+u*(18+hash(i+21)*27)+Math.sin(age*1.2+i)*(.7+u*2),y:v[1]-u*(106+hash(i+91)*84),radius:(.35+hash(i+112)*.62)*(1+u*.65),alpha:smooth(u*9)*smooth((1-u)*5)*(.20+hash(i+125)*.2)};
  }
  window.ABYSS_WATER={W,H,grains,waterRegions,particleAt,bubbleAt};
  window.createAbyssWater=photo=>{
    const make=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
    const mask=make(),m=mask.getContext('2d');m.fillStyle='#fff';
    waterRegions.forEach(points=>{m.beginPath();points.forEach(([x,y],i)=>i?m.lineTo(x,y):m.moveTo(x,y));m.closePath();m.fill();});
    // Erode and soften the mask so the moving image cannot expose a hard cut-out edge.
    const softened=make(),sm=softened.getContext('2d');sm.filter='blur(20px)';sm.drawImage(mask,0,0);sm.filter='none';
    const pixels=sm.getImageData(0,0,W,H),hard=m.getImageData(0,0,W,H);
    for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.min(hard.data[i],255*Math.pow(pixels.data[i]/255,4));sm.putImageData(pixels,0,0);
    const drift=make(),d=drift.getContext('2d'),distant=make(),dp=distant.getContext('2d');
    const glow=document.createElement('canvas');glow.width=glow.height=32;const gp=glow.getContext('2d'),g=gp.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(160,218,221,.5)');g.addColorStop(.3,'rgba(130,201,215,.12)');g.addColorStop(1,'rgba(130,201,215,0)');gp.fillStyle=g;gp.fillRect(0,0,32,32);
    function refract(ctx,time,source=photo){
      d.clearRect(0,0,W,H);d.globalCompositeOperation='source-over';
      for(let y=0;y<H;y+=14){const dx=Math.sin(y*.013-time*.27)*1.6+Math.cos(y*.026-time*.15)*.65;d.drawImage(source,0,y,W,Math.min(14,H-y),dx,y,W,Math.min(14,H-y));}
      d.globalCompositeOperation='destination-in';d.drawImage(softened,0,0);ctx.drawImage(drift,0,0);
    }
    function grain(ctx,p){
      if(p.alpha<.01)return;
      ctx.globalAlpha=p.alpha;
      if(p.near){ctx.drawImage(glow,p.x-p.radius*4,p.y-p.radius*4,p.radius*8,p.radius*8);}
      ctx.fillStyle=p.near?'#bbdad8':'#8fbac5';ctx.beginPath();ctx.ellipse(p.x,p.y,p.radius,p.radius*.72,-.3,0,TAU);ctx.fill();
    }
    function particles(ctx,time,strength=1){
      const t=time;dp.clearRect(0,0,W,H);dp.globalCompositeOperation='source-over';
      for(let i=0;i<154;i++)grain(dp,particleAt(i,t));
      dp.globalAlpha=1;dp.globalCompositeOperation='destination-in';dp.drawImage(softened,0,0);
      ctx.save();ctx.drawImage(distant,0,0);
      for(let i=154;i<grains.length;i++)grain(ctx,particleAt(i,t));
      ctx.globalAlpha=1;
      for(let i=0;i<39;i++){
        const b=bubbleAt(i,t);ctx.strokeStyle=`rgba(179,223,225,${b.alpha*(.45+.55*strength)})`;ctx.lineWidth=.45;
        ctx.beginPath();ctx.ellipse(b.x,b.y,b.radius,b.radius*1.16,0,0,TAU);ctx.stroke();
        ctx.fillStyle=`rgba(215,244,242,${b.alpha*.85})`;ctx.beginPath();ctx.arc(b.x-b.radius*.3,b.y-b.radius*.6,.28,0,TAU);ctx.fill();
      }
      ctx.restore();
    }
    function render(ctx,time,strength=1){refract(ctx,time);particles(ctx,time,strength);}
    return {render,refract,particles};
  };
})();
