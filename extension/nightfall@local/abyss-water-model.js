// Native model: identical schedules and geometry from abyss-water.js.

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

export const Model = {W,H,grains,waterRegions,particleAt,bubbleAt};
