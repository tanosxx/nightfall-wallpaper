/* Pulsing obstruction lamps, measured from the red sources in the plate. */
(() => {
  'use strict';
  const clamp=x=>Math.max(0,Math.min(1,x));
  const lamps=[
    [1149,154.3,1.6,3.2,0], [695.4,78,.64,3.7,.6],
    [800.8,83.2,.48,4.4,1.7], [900.9,100.9,.57,3.9,2.1],
    [911.5,54.5,.68,3.4,1.2], [928.8,103.1,.57,4.1,.25],
    [972,35,.52,3.5,.4], [993.5,36.5,.52,4.7,2.4], [1003.8,51.3,.52,3.6,1.9],
    [1101.4,81.8,.48,4.3,.7], [1286.5,103.5,.46,3.8,2.6],
    [1384.8,36.4,.50,4.6,1.4], [1392.7,57,.45,4.0,3.1],
  ].map(([x,y,scale,period,offset],id)=>({id,x,y,scale,period,offset}));
  function power(time,period=3.2,offset=0){
    const t=Number.isFinite(time)?Math.max(0,time):0;
    const phase=((t+offset)%period)/period;
    const distance=Math.min(phase,1-phase);
    return .025+.975*Math.exp(-Math.pow(distance/.115,2));
  }
  function sample(time){return lamps.map(l=>({...l,power:power(time,l.period,l.offset)}));}
  window.JUNCTION_BEACONS={lamps,power,sample};
  window.createJunctionBeacons=photo=>{
    const patches=lamps.map(l=>{
      const radius=Math.ceil(7*l.scale+3),size=radius*2+1;
      const x=Math.round(l.x)-radius,y=Math.round(l.y)-radius;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const c=canvas.getContext('2d');c.drawImage(photo,x,y,size,size,0,0,size,size);
      const pixels=c.getImageData(0,0,size,size);
      for(let p=0;p<pixels.data.length;p+=4){
        const r=pixels.data[p],g=pixels.data[p+1],b=pixels.data[p+2];
        const red=clamp((r-g-9)/32)*clamp((r-b-3)/21)*clamp((b-g+3)/16);
        pixels.data[p]=Math.round(r*.19);
        pixels.data[p+1]=Math.round(g*.38);
        pixels.data[p+2]=Math.round(b*.38);
        pixels.data[p+3]=Math.round(red*255);
      }
      c.putImageData(pixels,0,0);return {canvas,x,y};
    });
    function render(ctx,time){
      ctx.save();
      for(const l of sample(time)){
        const p=patches[l.id];ctx.globalCompositeOperation='source-over';
        ctx.globalAlpha=1-l.power;ctx.drawImage(p.canvas,p.x,p.y);
        ctx.globalAlpha=1;ctx.globalCompositeOperation='screen';
        const radius=8*l.scale;
        const glow=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,radius);
        glow.addColorStop(0,`rgba(255,49,50,${l.power*.82})`);
        glow.addColorStop(.22,`rgba(255,32,42,${l.power*.36})`);
        glow.addColorStop(1,'rgba(255,23,36,0)');
        ctx.fillStyle=glow;ctx.fillRect(l.x-radius,l.y-radius,radius*2,radius*2);
        ctx.fillStyle=`rgba(255,116,100,${l.power*.9})`;
        ctx.beginPath();ctx.ellipse(l.x,l.y,Math.max(.65,l.scale*1.25),Math.max(.65,l.scale),0,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    return {render,getDiagnostics:()=>({lamps:lamps.length,model:'photographed-red-beacons'})};
  };
})();
