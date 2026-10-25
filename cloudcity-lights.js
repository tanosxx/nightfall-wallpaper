/* Room circuits and obstruction beacons extracted from the photographic plate.
 * Only emission pixels change; masonry, mullions and turbine blades stay intact. */
(() => {
  'use strict';
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);};
  const box=(id,x,y,w,h,extra={})=>({id,polygon:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],...extra});
  // Each large glass-bearing floor has its own circuit. Bounds follow the
  // photographed floors, while source colours preserve the window framing.
  const rooms=[
    box('west-residence-upper',198,14,61,24,{first:2.3,on:true}),
    box('west-residence-lower',198,39,61,19,{first:6.1,on:false}),
    box('west-residence-lounge',176,72,84,35,{first:4.2,on:true}),
    box('west-workshop-upper',317,0,68,35,{first:7.2,on:true}),
    box('west-workshop-middle',317,37,68,31,{first:3.5,on:false}),
    box('west-workshop-lower',317,75,70,42,{first:5.4,on:true}),
    box('west-service-room',266,288,28,77,{first:6.7,on:true,residual:.22}),
    box('west-base-control',434,637,31,34,{first:3.1,on:false}),
    box('east-residence-top',1644,12,24,43,{first:4.8,on:true}),
    box('east-service-upper',1550,250,19,67,{first:7.6,on:true,residual:.3}),
    box('east-service-lower',1550,338,19,90,{first:5.9,on:false,residual:.3}),
    box('east-control-room',1644,473,28,71,{first:2.8,on:false}),
  ];
  const facades=[
    box('west-corridor',127,173,61,65),box('west-outer-shaft',419,74,21,174),
    box('west-middle-offices',182,150,22,322),box('west-inner-shaft',241,368,17,110),
    box('west-low-offices',294,531,14,41),box('west-tower-gallery',482,202,28,46),
    box('west-slim-tower',513,151,20,100),box('west-turbine-flank',553,338,22,188),
    box('west-deck-rooms',477,613,47,58),
    box('middle-tower-west',699,190,31,359),box('middle-tower-east',732,204,16,347),
    box('middle-tower-gallery',750,327,27,48),box('middle-tower-base',778,480,35,75),
    box('middle-tower-right-edge',804,370,14,134),box('middle-small-tower',644,414,26,86),
    box('east-tall-west-face',1358,302,16,162),box('east-tall-east-face',1378,310,22,156),
    box('east-mid-west-face',1241,350,19,205),box('east-mid-east-face',1263,351,18,191),
    box('east-gallery-tower',1293,367,31,136),box('east-low-tower',1204,481,17,84),
    box('near-east-left-face',1441,259,21,395),box('near-east-middle-face',1473,218,26,451),
    box('near-east-gallery',1492,382,27,22),box('near-east-rooms',1576,474,25,185),
    box('near-east-upper-shaft',1550,60,20,173),box('near-east-top-offices',1644,63,23,170),
    box('near-east-middle-offices',1644,244,28,172),box('near-east-lower-offices',1644,546,28,54),
  ];
  // x, y, radius scale; measured red photographic sources, never added objects.
  const beacons=[
    [515,125.2,1.05],[546.3,142.4,.84],[541.5,71,.42],[212.9,249.3,1.12],
    [562.6,252.2,.55],[554.5,295,.4],[734.2,143,.49],[803.6,358.8,.5],
    [1482,29.6,1.02],[1481.7,96.1,.78],[1511.1,142.4,1.14],[1545.6,13.5,1.22],
    [1448.3,152.3,.47],[1448.9,173.2,.65],[1455,173.8,.45],[1459.3,173.3,.41],
    [1373.3,232.7,.43],[1384.8,289.2,.54],[1358.1,289.9,.57],[1105,313.5,.3],
    [1621,391.8,.52],[616,499.5,.37],
  ].map(([x,y,scale],id)=>({id,x,y,scale,period:3.05+hash(id+910)*2.6,offset:hash(id+939)*5}));
  function inside(x,y,p){
    let result=false;
    for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])result=!result;
    return result;
  }
  function warmth(r,g,b){
    if(r<g-5||g<r*.44)return 0;
    const emission=smooth((r-b-9)/27)*smooth((g-b-2)/20)*smooth((r-43)/75);
    const white=smooth((Math.min(r,g,b)-165)/65)*smooth((r-b+12)/12)*smooth((g-b+10)/10);
    return Math.max(emission,white);
  }
  function timing(seed,room){
    const first=room?.first??2+hash(seed+10)*6,on=room?.on??hash(seed+11)>.31;
    const segments=[];let period=0;
    for(let i=0;i<12;i++){
      const target=i%2===0?Number(!on):Number(on),fade=.22+hash(seed+i*23+3)*.55;
      const hold=target?14+hash(seed+i*31+2)*57:4.5+hash(seed+i*39+4)*17;
      segments.push({start:period,target,fade,hold});period+=fade+hold;
    }
    return {first,on,segments,period,residual:room?.residual??.055+hash(seed+19)*.075};
  }
  function roomPower(s,time){
    const t=Number.isFinite(time)?Math.max(0,time):0;
    let p=Number(s.on);
    if(t>=s.first){
      const phase=(t-s.first)%s.period,segment=s.segments.findLast(a=>phase>=a.start);
      p=1-segment.target+(2*segment.target-1)*smooth((phase-segment.start)/segment.fade);
    }
    return s.residual+(1-s.residual)*p;
  }
  function beaconPower(beacon,time){
    const t=Number.isFinite(time)?Math.max(0,time):0,phase=((t+beacon.offset)%beacon.period)/beacon.period;
    return .018+.982*Math.exp(-Math.pow(Math.min(phase,1-phase)/.105,2));
  }
  window.CLOUDCITY_LIGHTS={rooms,facades,beacons,warmth,timing,roomPower,beaconPower};
  window.createCloudcityLights=photo=>{
    const W=photo.naturalWidth,H=photo.naturalHeight,sx=W/1672,sy=H/941;
    const source=document.createElement('canvas');source.width=W;source.height=H;
    const c=source.getContext('2d',{willReadFrequently:true});c.drawImage(photo,0,0);
    const pixels=c.getImageData(0,0,W,H).data,used=new Uint8Array(W*H),circuits=[];
    function patch(indices,id,seed,room){
      const left=Math.min(...indices.map(p=>p%W)),right=Math.max(...indices.map(p=>p%W));
      const top=Math.min(...indices.map(p=>Math.floor(p/W))),bottom=Math.max(...indices.map(p=>Math.floor(p/W)));
      const width=right-left+1,height=bottom-top+1,dark=document.createElement('canvas'),bright=document.createElement('canvas');
      dark.width=bright.width=width;dark.height=bright.height=height;
      const d=dark.getContext('2d'),b=bright.getContext('2d'),off=d.createImageData(width,height),on=b.createImageData(width,height);
      let mean=0;
      for(const p of indices){
        const si=p*4,di=((Math.floor(p/W)-top)*width+p%W-left)*4;
        const r=pixels[si],g=pixels[si+1],blue=pixels[si+2],alpha=255*Math.pow(warmth(r,g,blue),.4);
        // A cool unlit interior preserves fine furniture/glass texture.
        off.data.set([8+r*.16,14+g*.19,22+blue*.23,alpha],di);
        on.data.set([Math.min(255,r*1.5+13),Math.min(235,g*1.32+9),Math.min(185,blue*1.14+4),alpha],di);
        used[p]=1;mean+=r;
      }
      d.putImageData(off,0,0);b.putImageData(on,0,0);
      circuits.push({id,x:left,y:top,w:width,h:height,pixels:indices.length,dark,bright,relight:mean/indices.length<151,schedule:timing(seed,room)});
    }
    for(let zi=0;zi<rooms.length+facades.length;zi++){
      const room=zi<rooms.length?rooms[zi]:null,zone=room??facades[zi-rooms.length];
      const polygon=zone.polygon.map(([x,y])=>[x*sx,y*sy]);
      const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0])))),right=Math.min(W,Math.ceil(Math.max(...polygon.map(p=>p[0]))));
      const top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1])))),bottom=Math.min(H,Math.ceil(Math.max(...polygon.map(p=>p[1]))));
      const width=right-left,height=bottom-top,mask=new Uint8Array(width*height),indices=[];
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const p=y*W+x;if(used[p]||!inside(x+.5,y+.5,polygon))continue;
        if(warmth(pixels[p*4],pixels[p*4+1],pixels[p*4+2])>.045){mask[(y-top)*width+x-left]=1;indices.push(p);}
      }
      if(room){if(indices.length)patch(indices,room.id,zi*137+71,room);continue;}
      let count=0;
      for(let start=0;start<mask.length;start++){
        if(!mask[start])continue;
        const queue=[start],component=[];mask[start]=0;
        for(let cursor=0;cursor<queue.length;cursor++){
          const p=queue[cursor],x=p%width,y=Math.floor(p/width);component.push((top+y)*W+left+x);
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const xx=x+dx,yy=y+dy,n=yy*width+xx;
            if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[n]){mask[n]=0;queue.push(n);}
          }
        }
        if(component.length>=2)patch(component,`${zone.id}-${count}`,zi*137+(count++)*29+71);
      }
    }
    const redMasks=beacons.map(beacon=>{
      const radius=Math.ceil(8*beacon.scale+2),x=Math.max(0,Math.round(beacon.x*sx)-radius),y=Math.max(0,Math.round(beacon.y*sy)-radius);
      const width=Math.min(W-x,radius*2+1),height=Math.min(H-y,radius*2+1),canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),data=ctx.createImageData(width,height);
      for(let py=0;py<height;py++)for(let px=0;px<width;px++){
        const si=((y+py)*W+x+px)*4,di=(py*width+px)*4,r=pixels[si],g=pixels[si+1],b=pixels[si+2];
        // The sunset is also redder than blue. A red/green ratio gate keeps
        // peach sky completely outside the mask, including right by a mast.
        const distance=Math.hypot((x+px-beacon.x*sx)/sx,(y+py-beacon.y*sy)/sy);
        const red=clamp((r-g-18)/42)*clamp((r*.78-g)/28)*clamp((r-b-10)/27)*clamp((b-g*.62+3)/15)*smooth((6*beacon.scale+2-distance)/2);
        data.data.set([10+r*.10,13+g*.10,19+b*.12,red*255],di);
      }
      ctx.putImageData(data,0,0);return {canvas,x,y};
    });
    function render(ctx,time,strength=1){
      strength=clamp(Number.isFinite(strength)?strength:1);ctx.save();ctx.globalCompositeOperation='source-over';
      for(const circuit of circuits){
        const power=roomPower(circuit.schedule,time);
        ctx.globalAlpha=(1-power)*strength;ctx.drawImage(circuit.dark,circuit.x/sx,circuit.y/sy,circuit.w/sx,circuit.h/sy);
        if(circuit.relight){ctx.globalAlpha=power*.56*strength;ctx.drawImage(circuit.bright,circuit.x/sx,circuit.y/sy,circuit.w/sx,circuit.h/sy);}
      }
      for(const beacon of beacons){
        const power=beaconPower(beacon,time),mask=redMasks[beacon.id];
        ctx.globalCompositeOperation='source-over';ctx.globalAlpha=(1-power)*strength;
        ctx.drawImage(mask.canvas,mask.x/sx,mask.y/sy,mask.canvas.width/sx,mask.canvas.height/sy);
        ctx.globalCompositeOperation='screen';ctx.globalAlpha=strength;
        const radius=8*beacon.scale,glow=ctx.createRadialGradient(beacon.x,beacon.y,0,beacon.x,beacon.y,radius);
        glow.addColorStop(0,`rgba(255,53,63,${power*.75})`);glow.addColorStop(.22,`rgba(255,31,44,${power*.31})`);glow.addColorStop(1,'rgba(255,25,40,0)');
        ctx.fillStyle=glow;ctx.fillRect(beacon.x-radius,beacon.y-radius,radius*2,radius*2);
        ctx.fillStyle=`rgba(255,135,117,${power*.82})`;ctx.beginPath();ctx.ellipse(beacon.x,beacon.y,Math.max(.42,beacon.scale),Math.max(.42,beacon.scale*.75),0,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    return {render,circuits,getDiagnostics:()=>({model:'source-masked-independent-room-circuits',circuits:circuits.length,largeRooms:rooms.length,facades:facades.length,beacons:beacons.length,emissionPixels:circuits.reduce((n,p)=>n+p.pixels,0)})};
  };
})();
