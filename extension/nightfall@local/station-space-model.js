// Same background dust trajectories as the approved browser scene.

  const TAU=Math.PI*2, W=1672, H=941;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const fract=x=>x-Math.floor(x);
  const hash=x=>fract(Math.sin(x*127.1+311.7)*43758.5453);
  const wrap=(x,span)=>((x%span)+span)%span;
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

export const Model={sample,particles};
