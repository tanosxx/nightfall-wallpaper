// Exact approved mechanical geometry and timing from station-industrial.js.

  const TAU = Math.PI * 2;
  const clamp = v => Math.max(0, Math.min(1, v));
  const smooth = v => {v = clamp(v); return v * v * (3 - 2 * v);};
  const fract = v => v - Math.floor(v);
  const hash = v => fract(Math.sin(v * 127.1 + 311.7) * 43758.5453);
  const vents = [
    {x: 991, y: 542, dx: -.25, dy: -.97, speed: 8, life: 3.9, size: 2, spread: 3.1, period: 11.3, offset: 3.1, alpha: .24},
    {x: 961, y: 324, dx: -.94, dy: -.34, speed: 8, life: 4.1, size: 2.1, spread: 3.2, period: 9.7, offset: 6.2, alpha: .21},
    {x: 1473, y: 590, dx: .85, dy: -.53, speed: 8, life: 3.7, size: 2, spread: 3.1, period: 13.1, offset: .9, alpha: .22},
    {x: 1297, y: 620, dx: -.34, dy: -1, speed: 5, life: 3.7, size: 2.5, spread: 3.3, period: 8.3, offset: 2.7, alpha: .16, warm: true},
  ];
  const strips = [
    {points: [[957,597],[976,597],[997,596]], width: 1.5},
    {points: [[923,725],[923,742]], width: 1.5},
    {points: [[1426,515],[1447,508]], width: 1.5},
    {points: [[1438,643],[1437,657]], width: 1.4},
    {points: [[1143,749],[1184,744]], width: .9},
    {points: [[1184,744],[1239,736]], width: .9},
    {points: [[1239,736],[1299,725]], width: .9},
  ];
  function stroke(ctx, points, color, width) {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function polygon(ctx, points, color) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  // Smooth value noise is baked once into a handful of translucent sprites.
  // Irregular edges avoid a string of circular "smoke balls".
  function noise(x,y,seed) {
    const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(fract(x)),fy=smooth(fract(y));
    const a=hash(ix+iy*157+seed),b=hash(ix+1+iy*157+seed);
    const c=hash(ix+(iy+1)*157+seed),d=hash(ix+1+(iy+1)*157+seed);
    return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  }
  function steamSamples(t,intensity=1) {
    if(intensity<=0)return [];
    const samples=[],step=.14;
    vents.forEach((vent,index)=>{
      const local=t+vent.offset,last=Math.floor(local/step),first=Math.floor((local-vent.life)/step);
      for(let birth=first;birth<=last;birth++){
        const born=birth*step,cycle=Math.floor(born/vent.period),phase=born-cycle*vent.period;
        const duration=1.8+hash(cycle+index*43)*1.4;
        if(phase>duration)continue;
        const seed=birth+index*4099,age=local-born,life=vent.life*(.78+.22*hash(seed+10));
        if(age<0||age>=life)continue;
        const velocity=vent.speed*(.8+.4*hash(seed+4)),side=(hash(seed+7)-.5)*age*2.8;
        const length=Math.hypot(vent.dx,vent.dy),dx=vent.dx/length,dy=vent.dy/length;
        const envelope=smooth(age/.3)*(1-smooth(age/life));
        samples.push({x:vent.x+dx*velocity*age-dy*side,y:vent.y+dy*velocity*age+dx*side,
          radius:vent.size+age*vent.spread,angle:hash(seed+11)*TAU+age*(hash(seed+13)-.5)*.2,
          alpha:vent.alpha*envelope*(.72+.28*hash(seed+19)),texture:(Math.abs(birth)%4)+(vent.warm?4:0),vent:index});
      }
    });return samples;
  }
  // A fixed rail carriage travels, dwells at the end, then returns smoothly.
  function carriagePosition(t) {
    const phase=fract(t/27.4);
    if(phase<.08)return 0;
    if(phase<.46)return smooth((phase-.08)/.38);
    if(phase<.59)return 1;
    if(phase<.97)return 1-smooth((phase-.59)/.38);
    return 0;
  }

export const Model={vents,strips,steamSamples,carriagePosition};
export function createStationIndustrial(sprites){
    return {
      carriagePosition,
      steam(ctx,t,intensity) {
        const samples=steamSamples(t,intensity);ctx.save();
        for(const puff of samples){ctx.save();ctx.translate(puff.x,puff.y);ctx.rotate(puff.angle);
          ctx.globalAlpha=puff.alpha;ctx.drawImage(sprites[puff.texture],-puff.radius,-puff.radius,puff.radius*2,puff.radius*2);ctx.restore();}
        ctx.restore();return samples.length;
      },
      neon(ctx,motion,lighting) {
        ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
        strips.forEach((strip,i)=>{
          const power=motion.neonBrightness?motion.neonBrightness(i):.65;
          // A tight dark core attenuates the original baked-in fixture on dips.
          stroke(ctx,strip.points,`rgba(9,25,31,${(1-power)*.78})`,strip.width+1);
          ctx.globalCompositeOperation='screen';
          stroke(ctx,strip.points,`rgba(65,179,205,${power*.15*lighting.exteriorGain})`,strip.width*7);
          stroke(ctx,strip.points,`rgba(86,212,231,${power*.36*lighting.exteriorGain})`,strip.width*3);
          stroke(ctx,strip.points,`rgba(190,249,249,${power*.85})`,strip.width);
          ctx.globalCompositeOperation='source-over';
        });ctx.restore();
      },
      rotor(ctx,t) {
        ctx.save();ctx.translate(960,371);ctx.scale(1,.31);
        ctx.beginPath();ctx.ellipse(0,0,13.5,12.5,0,0,TAU);ctx.clip();
        ctx.fillStyle='rgba(12,20,24,.72)';ctx.fillRect(-14,-13,28,26);
        for(let i=0;i<5;i++){
          ctx.save();const angle=t*TAU/13.6+i*TAU/5;ctx.rotate(angle);
          const light=Math.round(51+17*Math.cos(angle-2.4));
          polygon(ctx,[[1.5,-1],[4,-3.8],[12,-2.2],[11.3,1.4],[3,2]],`rgb(${light},${light+5},${light+6})`);
          stroke(ctx,[[4,-3.8],[12,-2.2]],'rgba(146,153,147,.42)',.5);ctx.restore();
        }
        ctx.fillStyle='#7c8179';ctx.beginPath();ctx.arc(0,0,2,0,TAU);ctx.fill();ctx.restore();
      },
      machinery(ctx,t) {
        const u=carriagePosition(t),x=1183+u*101,y=583-u*15;
        ctx.save();ctx.lineJoin='round';
        // Parallel ceiling rails follow the hangar's photographed perspective.
        stroke(ctx,[[1175,584],[1291,567]],'rgba(20,24,25,.65)',2);
        stroke(ctx,[[1175,583],[1291,566]],'rgba(133,126,107,.48)',.65);
        stroke(ctx,[[1174,579],[1290,562]],'rgba(22,25,26,.6)',1.6);
        polygon(ctx,[[x-5,y-4],[x+4,y-7],[x+10,y-5],[x+1,y-2]],'#736e5e');
        polygon(ctx,[[x-5,y-4],[x+1,y-2],[x+1,y+2],[x-5,y]],'#353a3b');
        polygon(ctx,[[x+1,y-2],[x+10,y-5],[x+10,y-1],[x+1,y+2]],'#4c514c');
        const lowered=5+4*(.5+.5*Math.sin(t*.32));
        stroke(ctx,[[x+2,y+1],[x+2,y+lowered]],'#373d3d',.7);
        stroke(ctx,[[x+2,y+lowered],[x+4,y+lowered+1],[x+6,y+lowered-1]],'#99907b',1);
        ctx.fillStyle=`rgba(255,178,70,${.4+.6*Math.max(0,Math.sin(t*3.1))})`;ctx.fillRect(x+6,y-3,1.4,1);
        ctx.restore();
      },
    };
}
