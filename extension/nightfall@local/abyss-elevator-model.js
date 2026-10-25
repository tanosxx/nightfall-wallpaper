// Native model: identical schedules and geometry from abyss-elevator.js.

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

export const Model = {sample,glass,bars,cycle,stages};
