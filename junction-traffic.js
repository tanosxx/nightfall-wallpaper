/* Source-aligned city traffic. Its bright paired cores, coloured short trails,
 * uneven arrivals and varied cruise speeds follow the first city scene. */
(() => {
  'use strict';
  const W=1672,H=941,clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  const mod=(n,m)=>(n%m+m)%m;
  const routes=[
    {id:'distant-crossing',points:[[637,246],[754,247],[908,247],[1043,249]],
      duration:39,phase:23.4,depth:1.02,scale:[.30,.39],lane:.48,clip:[3.1,3.6],flow:1.15,
      gaps:[22.7,31.4,19.6,27.3,35.1,24.8,18.7,29.2],
      occlusion:[[[839,230],[854,230],[854,268],[839,268]]]},
    {id:'rear-service',points:[[707,280],[728,292],[747,319],[737,344]],
      duration:29,phase:11.3,depth:1.25,scale:[.28,.49],lane:.56,clip:[2.7,3.7],flow:1.8,clearance:.10,
      gaps:[19.2,26.4,22.1,33.7,17.8,28.6,24.3,31.2],occlusion:[]},
    {id:'west-access',points:[[717,402],[718,423],[709,445],[696,459]],
      duration:26,phase:36.1,depth:1.14,scale:[.40,.58],lane:.65,clip:[3.8,4.8],flow:2,clearance:.13,
      gaps:[27.3,18.6,35.2,23.4,30.1,21.7,32.8,25.3],occlusion:[]},
    {id:'central-access',points:[[965,451],[985,465],[1032,505],[1056,537]],
      duration:32,phase:17.6,depth:1.29,scale:[.51,.91],lane:1.2,clip:[5.7,8.5],
      gaps:[24.8,34.1,20.7,29.3,38.4,22.6,31.7,26.2],
      occlusion:[[[1002,461],[1008,461],[1009,521],[1002,521]],
        [[1014,467],[1022,467],[1023,541],[1014,541]],
        [[975,473],[1059,473],[1059,478],[975,478]],
        [[1007,479],[1016,487],[1016,492],[1007,484]],
        [[1059,414],[1124,414],[1124,587],[1059,576]]]},
    {id:'station-access',points:[[1140,467],[1176,482],[1258,526],[1309,556]],
      duration:37,phase:43.7,depth:1.22,scale:[.54,1],lane:1.15,clip:[5.6,8.1],
      gaps:[29.6,21.8,35.4,25.1,32.7,19.9,37.3,24.6],
      occlusion:[[[1207,476],[1213,476],[1213,521],[1207,521]],
        [[1265,493],[1274,493],[1277,550],[1266,550]],
        [[1298,440],[1314,440],[1316,577],[1300,577]]]},
    {id:'inner-service',points:[[924,487],[942,506],[959,535],[982,558]],
      duration:24,phase:13.8,depth:1.19,scale:[.58,.87],lane:1.3,clip:[5.3,6.8],flow:1.4,clearance:.09,
      gaps:[21.7,29.4,17.3,32.7,24.1,18.8,23.5,31.4],
      occlusion:[[[925,484],[930,484],[931,499],[926,499]],
        [[977,551],[984,552],[984,571],[978,570]]]},
    {id:'west-underpass',points:[[724,503],[724,513],[720,528],[716,543]],
      duration:15,phase:8.7,depth:1.13,scale:[.48,.64],lane:1.05,clip:[3.9,4.6],clearance:.11,
      gaps:[19.3,28.8,22.4,34.7,18.9,24.1,31.6,20.3],
      occlusion:[[[680,480],[738,480],[738,511],[680,506]],
        [[680,531],[738,540],[738,551],[680,543]],
        [[714,522],[717,522],[717,540],[714,540]]]},
    {id:'underdeck-street',points:[[738,907],[739,918],[738,931],[737,946]],
      duration:14,phase:8.4,depth:1.20,scale:[.48,.68],lane:1.55,clip:[5.1,5.6],clearance:.13,
      gaps:[18.2,23.8,16.4,30.1,20.6,27.4,24.9,19.7],
      // The only road visible at the bottom is this narrow street through
      // the bridge opening. No traffic is drawn across the surrounding walls.
      occlusion:[[[650,0],[850,0],[850,950],[690,881],[650,867]],
        [[725,900],[729,900],[729,941],[725,941]]]},
  ];
  const speedFactors=[.65,1.42,.91,1.65,1.08,.78,1.27,.98];
  const palette={white:[224,247,255],warm:[255,210,140],blue:[137,221,255],red:[255,109,83],purple:[226,144,255]};
  const coloursForward=['white','blue','warm','purple','white','blue','warm','red'];
  const coloursReturn=['red','warm','purple','red','blue','warm','red','purple'];
  const fleets=routes.flatMap((route,routeIndex)=>[1,-1].map((direction,laneIndex)=>{
    let period=0;
    // Short independent arrivals interspersed with an actual quiet stretch,
    // instead of the old near-constant 20–35 second gaps in every lane.
    const intervals=route.gaps.map((gap,i)=>gap*(i===6?1.02:.17+(i%3)*.035)*(laneIndex?1.17:1)*(route.flow||1));
    const offsets=intervals.map(gap=>{const offset=period;period+=gap;return offset;});
    return {route,routeIndex,direction,period,offsets,
      phase:route.phase+(laneIndex?17.9+routeIndex*2.7:0)};
  }));

  function routePoint(routeOrId,u,direction=0){
    const route=typeof routeOrId==='string'?routes.find(route=>route.id===routeOrId):routeOrId;
    u=clamp(u);const v=1-u,[a,b,c,d]=route.points;
    const x=v*v*v*a[0]+3*v*v*u*b[0]+3*v*u*u*c[0]+u*u*u*d[0];
    const y=v*v*v*a[1]+3*v*v*u*b[1]+3*v*u*u*c[1]+u*u*u*d[1];
    const dx=3*v*v*(b[0]-a[0])+6*v*u*(c[0]-b[0])+3*u*u*(d[0]-c[0]);
    const dy=3*v*v*(b[1]-a[1])+6*v*u*(c[1]-b[1])+3*u*u*(d[1]-c[1]);
    const length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
    const lane=direction*route.lane*(.72+.28*u);
    return {x:x+nx*lane,y:y+ny*lane,dx:dx/length,dy:dy/length,nx,ny,
      scale:route.scale[0]+(route.scale[1]-route.scale[0])*u};
  }
  function event(fleet,index){
    const local=mod(index,8),cycle=Math.floor(index/8);
    const variant=mod(local+fleet.routeIndex+(fleet.direction<0?3:0),8);
    return {index,start:cycle*fleet.period+fleet.offsets[local]-fleet.phase,
      duration:fleet.route.duration/speedFactors[variant],speedFactor:speedFactors[variant]};
  }
  function inside(point,polygon){
    let yes=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    }
    return yes;
  }
  function sample(inputTime){
    const time=Number.isFinite(inputTime)&&inputTime>=0?inputTime:0,vehicles=[];
    for(const fleet of fleets){
      const elapsed=time+fleet.phase,cycle=Math.floor(elapsed/fleet.period),local=mod(elapsed,fleet.period);
      let slot=7;while(slot>0&&fleet.offsets[slot]>local)slot--;
      const latest=cycle*8+slot;
      let leader=Infinity;
      // Sample older trips first, including cars already beyond the image.
      // Faster cars ease into their leader's pace without overtaking through
      // it; keeping the departed leaders prevents jumps at the exit.
      for(let index=latest-31;index<=latest;index++){
        const trip=event(fleet,index),freeProgress=(time-trip.start)/trip.duration;
        const progress=Math.min(freeProgress,leader-(fleet.route.clearance||.065));
        leader=progress;
        if(progress<0||progress>=1)continue;
        const s=fleet.direction===1?progress:1-progress;
        const u=s/(fleet.route.depth+(1-fleet.route.depth)*s);
        const p=routePoint(fleet.route,u,fleet.direction);
        const opacity=smooth(progress/.045)*smooth((1-progress)/.045);
        const variant=mod(index+fleet.routeIndex*3,8);
        const colourName=(fleet.direction===1?coloursForward:coloursReturn)[variant];
        const intensity=.70+mod(index*7+fleet.routeIndex*3,11)*.03;
        vehicles.push({id:`${fleet.route.id}:${fleet.direction}:${index}`,route:fleet.route.id,
          direction:fleet.direction,progress,u,...p,opacity,start:trip.start,duration:trip.duration,
          lights:fleet.direction===1?'white':'red',
          speedFactor:trip.speedFactor,colourName,color:palette[colourName],intensity,
          trail:(2.6+mod(index*5+fleet.routeIndex,7)*.62)*(.65+p.scale*.65),
          glowRadius:3.8+Math.min(1,p.scale)*2.2,
          length:(7.1+mod(index+fleet.routeIndex,3)*.65)*p.scale,width:3.25*p.scale,
          visible:opacity>.01&&p.y>=0&&p.y<H&&p.x>=0&&p.x<W&&!fleet.route.occlusion.some(shape=>inside(p,shape))});
      }
    }
    return vehicles;
  }
  function path(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
  function corridor(route){
    const left=[],right=[];
    for(let i=0;i<=40;i++){
      const u=i/40,p=routePoint(route,u),width=route.clip[0]+(route.clip[1]-route.clip[0])*u;
      left.push([p.x+p.nx*width,p.y+p.ny*width]);right.unshift([p.x-p.nx*width,p.y-p.ny*width]);
    }
    return [...left,...right];
  }
  function glow(ctx,x,y,rx,ry,rgb,power){
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
    gradient.addColorStop(0,`rgba(${rgb},${power})`);gradient.addColorStop(.25,`rgba(${rgb},${power*.5})`);gradient.addColorStop(1,`rgba(${rgb},0)`);
    ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  window.JUNCTION_TRAFFIC={routes,sample,routePoint,inside};
  window.createJunctionTraffic=photo=>{
    const layer=document.createElement('canvas');layer.width=W;layer.height=H;
    const draw=layer.getContext('2d'),corridors=routes.map(corridor);
    let lastTime=0;
    function render(ctx,time,strength=.6){
      lastTime=Number.isFinite(time)&&time>=0?time:0;
      const vehicles=sample(time),power=.76+clamp(strength)*.24;
      draw.clearRect(0,0,W,H);
      for(let ri=0;ri<routes.length;ri++){
        const route=routes[ri];draw.save();path(draw,corridors[ri]);draw.clip();
        for(const car of vehicles.filter(car=>car.route===route.id)){
          if(car.opacity<.001)continue;
          draw.save();draw.globalAlpha=car.opacity;draw.translate(car.x,car.y);
          draw.rotate(Math.atan2(car.dy*car.direction,car.dx*car.direction));
          const length=car.length,width=car.width;
          // Wet contact shadow and low, unlit utility-vehicle body.
          draw.fillStyle='rgba(2,8,12,.48)';draw.beginPath();draw.ellipse(0,.4*car.scale,length*.60,width*.70,0,0,Math.PI*2);draw.fill();
          if(car.scale>.38){
            path(draw,[[-length*.48,-width*.46],[length*.30,-width*.46],[length*.48,-width*.27],
              [length*.48,width*.27],[length*.30,width*.46],[-length*.48,width*.46]]);
            draw.fillStyle='rgba(19,27,31,.94)';draw.fill();
            draw.strokeStyle='rgba(103,122,126,.37)';draw.lineWidth=.42*car.scale;draw.stroke();
            draw.fillStyle='rgba(57,76,83,.65)';draw.fillRect(-length*.04,-width*.34,length*.21,width*.68);
          }
          draw.globalCompositeOperation='screen';
          const rgb=car.color.join(','),lampX=length*.30,energy=power*car.intensity;
          // The first city's readable light treatment: a bright pair, a
          // roughly 5.5px glow and a short trail following the lane direction.
          glow(draw,lampX,0,car.glowRadius,car.glowRadius,rgb,.62*energy);
          const tail=draw.createLinearGradient(lampX-car.trail,0,lampX,0);
          tail.addColorStop(0,`rgba(${rgb},0)`);tail.addColorStop(.55,`rgba(${rgb},${.45*energy})`);tail.addColorStop(1,`rgba(${rgb},${.80*energy})`);
          draw.strokeStyle=tail;draw.lineWidth=.85+car.scale*.38;draw.lineCap='round';
          draw.beginPath();draw.moveTo(lampX-car.trail,0);draw.lineTo(lampX,0);draw.stroke();
          glow(draw,lampX+1.8*car.scale,0,5.4*car.scale,1.8*car.scale,rgb,.25*energy);
          for(const side of [-1,1]){
            const y=side*Math.max(.70,width*.34),core=.98+car.scale*.38;
            draw.fillStyle=`rgba(${rgb},${energy})`;
            draw.fillRect(lampX-core/2,y-.43,core,.86);
          }
          draw.restore();
        }
        // Remove only traffic pixels behind original gantries and pillars.
        draw.globalCompositeOperation='destination-out';draw.fillStyle='#000';
        for(const shape of route.occlusion){path(draw,shape);draw.fill();}
        draw.restore();
      }
      ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);ctx.restore();
    }
    function getDiagnostics(time=lastTime){
      const vehicles=sample(time);
      return {model:'city-style-bidirectional-traffic',corridors:routes.length,directions:fleets.length,
        vehicles:vehicles.length,visible:vehicles.filter(car=>car.visible).length,
        lowerVisible:vehicles.filter(car=>car.visible&&car.y>900).length,
        colors:[...new Set(vehicles.map(car=>car.colourName))],
        occluded:vehicles.filter(car=>car.opacity>.01&&!car.visible).length,
        masks:routes.reduce((count,route)=>count+route.occlusion.length,0)};
    }
    return {render,getDiagnostics};
  };
})();
