/* A cabin seen only by its interior light through the distant left shaft. */
(() => {
  'use strict';
  const top=478,bottom=774;
  const stages=[
    {from:top,to:top,duration:2.2},
    {from:top,to:548,duration:8.5},
    {from:548,to:548,duration:4.2},
    {from:548,to:625,duration:9.5},
    {from:625,to:625,duration:5.4},
    {from:625,to:bottom,duration:16},
    {from:bottom,to:bottom,duration:6.1},
    {from:bottom,to:590,duration:18},
    {from:590,to:590,duration:5.6},
    {from:590,to:top,duration:13.5},
    {from:top,to:top,duration:5}
  ];
  // The return's final dwell closes the loop without a visible reset.
  const cycle=stages.reduce((sum,s)=>sum+s.duration,0);
  const glass=[[[627,471],[632,473],[638,789],[633,787]],[[635,474],[641,476],[647,791],[642,789]]];
  const bars=[521,551,584,636,658,700,744];
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function sample(time){
    let phase=((time%cycle)+cycle)%cycle,stage=stages[stages.length-1];
    for(const s of stages){stage=s;if(phase<s.duration)break;phase-=s.duration;}
    const u=Math.min(1,phase/stage.duration),move=stage.to!==stage.from;
    // Constant travel in the middle with gentle acceleration/deceleration.
    const ramp=.16,area=1-ramp;
    const pos=u<ramp?u*u/(2*ramp*area):u>1-ramp?1-(1-u)*(1-u)/(2*ramp*area):(u-ramp/2)/area;
    const y=stage.from+(stage.to-stage.from)*(move?pos:0),depth=(y-top)/(bottom-top);
    return {x:633.4+depth*5.6,y,height:13-depth*4,width:8-depth*1.5,moving:move,direction:Math.sign(stage.to-stage.from),door:move?0:smooth(u*5)*smooth((1-u)*5),cycle};
  }
  window.ABYSS_ELEVATOR={sample,glass,bars,cycle,stages};
  window.createAbyssElevator=photo=>{
    const X=619,Y=462,W=37,H=338;
    const cache=Object.assign(document.createElement('canvas'),{width:W,height:H}),p=cache.getContext('2d',{willReadFrequently:true});
    p.save();p.beginPath();for(const points of glass){points.forEach(([x,y],i)=>i?p.lineTo(x-X,y-Y):p.moveTo(x-X,y-Y));p.closePath();}p.clip();p.drawImage(photo,X,Y,W,H,0,0,W,H);p.restore();const pixels=p.getImageData(0,0,W,H);
    // Suppress the baked-in cabin/window light; leave cool shaft detail intact.
    for(let k=0;k<pixels.data.length;k+=4){const r=pixels.data[k],g=pixels.data[k+1],b=pixels.data[k+2];const warm=smooth((r-b-10)/45)*smooth((r-48)/95);pixels.data[k]=r*.14;pixels.data[k+1]=g*.23;pixels.data[k+2]=b*.4;pixels.data[k+3]*=warm*.87;}
    p.putImageData(pixels,0,0);
    function render(ctx,time){
      const s=sample(time);ctx.save();ctx.drawImage(cache,X,Y);ctx.beginPath();
      for(const points of glass){points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.clip();
      // Reflected illumination moves along both narrow glazed strips.
      const halo=ctx.createRadialGradient(s.x,s.y,1,s.x,s.y,26);halo.addColorStop(0,'rgba(255,185,83,.48)');halo.addColorStop(.35,'rgba(245,163,61,.19)');halo.addColorStop(1,'rgba(240,154,56,0)');
      ctx.fillStyle=halo;ctx.fillRect(s.x-27,s.y-27,54,54);
      const cabin=ctx.createLinearGradient(0,s.y-s.height/2,0,s.y+s.height/2);cabin.addColorStop(0,'rgba(255,219,151,0)');cabin.addColorStop(.2,'rgba(255,208,126,.7)');cabin.addColorStop(.72,'rgba(255,186,84,.56)');cabin.addColorStop(1,'rgba(255,196,111,0)');
      ctx.fillStyle=cabin;ctx.fillRect(s.x-s.width/2,s.y-s.height/2,s.width,s.height);
      ctx.fillStyle=`rgba(255,233,184,${.65+s.door*.24})`;ctx.fillRect(s.x-s.width/2,s.y-s.height*.3,s.width,1.1);
      // Reinstate the real cross-braces over the moving light.
      for(const y of bars)ctx.drawImage(photo,X,y,W,1.8,X,y,W,1.8);
      ctx.restore();
    }
    return {render};
  };
})();
