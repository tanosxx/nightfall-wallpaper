/* Apartment activity extracted from the photographed window panes themselves.
 * Darkening replaces warm emission pixels, never a rectangle of the facade. */
(() => {
  'use strict';
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);};
  const rect=(id,x,y,w,h,min=3)=>({id,polygon:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],min});
  // These bounds contain glass-bearing facades, not the illuminated concrete
  // parapets, station lamps, skyline beacons or moving train paths.
  const facades=[
    rect('near-west-crown',0,0,61,38,5),
    {id:'near-west-lounge',polygon:[[0,134],[77,137],[77,177],[0,174]],min:10},
    {id:'near-west-offices',polygon:[[0,306],[67,301],[68,376],[0,383]],min:12},
    {id:'near-west-lower',polygon:[[0,438],[69,438],[69,477],[0,474]],min:10},
    rect('west-slim',232,0,20,112),rect('west-blue',258,0,40,116),
    rect('west-background',312,0,59,108),rect('west-highrise',380,0,85,143),
    rect('west-middle',492,74,30,116),{...rect('west-tower',515,131,36,102,4),active:true},
    rect('west-back-tower',568,10,70,116),rect('west-distant',619,145,36,99),
    rect('centre-west',660,67,66,129),rect('centre-tall',733,25,61,166),
    rect('centre-spire',795,0,61,195),rect('centre-glass',861,66,71,137),
    rect('centre-east',940,51,42,172),rect('east-tall',983,0,43,195),
    rect('east-blue',1034,25,60,199),rect('east-small',1096,0,45,156),
    rect('east-rooftops',1149,0,63,150),rect('east-distant',1220,0,38,172),
    rect('east-rear',1273,0,46,213),rect('east-wide',1330,0,77,218),
    rect('east-slim',1422,0,46,225),
    {id:'near-east-crown',polygon:[[1570,0],[1671,0],[1671,125],[1568,126]],min:8},
    {id:'near-east-offices',polygon:[[1559,182],[1671,177],[1671,263],[1559,254]],min:10},
    // The terminal has three lighting circuits, separated at photographed
    // vertical mullions. Their boundaries follow the sloping window sill.
    {id:'east-terminal-west',polygon:[[1299,264],[1325,267],[1325,295],[1299,292]],min:10,glassTop:true,firstOut:5.4},
    {id:'east-terminal-middle',polygon:[[1327,267],[1358,270.5],[1358,299],[1327,295.5]],min:10,glassTop:true,firstIn:11.2},
    {id:'east-terminal-east',polygon:[[1360,271],[1399,275.3],[1399,304],[1360,299.5]],min:10,glassTop:true},
    {...rect('east-control-tower',1106,198,102,120,5),active:true},
    {id:'east-lower-offices',polygon:[[1341,481],[1437,503],[1437,540],[1341,518]],min:6},
    {...rect('lower-distant',502,858,49,83,3),active:true},
    {...rect('west-midlevel-windows',419,431,65,43,5),active:true},
    {...rect('west-lower-windows',423,478,55,36,4),active:true},
    {...rect('central-lower-rooms',777,514,57,25,5),active:true},
    {...rect('east-lower-rooms',1224,475,88,49,5),active:true}
  ];
  // Large yellow sources inside the portrait preview's centre crop. Each
  // source owns its photographed spill and wet reflection, not just its core.
  // Lobes are x/y/radiusX/radiusY; cores optionally have a photographed slope.
  const practicals=[
    {id:'lower-walk-west',first:2.1,on:true,cores:[[443,730,11,5,-.18]],lobes:[[443,753,47,69]]},
    {id:'lower-walk-workshop',first:4.1,on:false,cores:[[530,745,18,5,.24]],lobes:[[529,764,44,41]]},
    {id:'lower-walk-centre',first:2.8,on:true,cores:[[610,767,24,6,.28]],lobes:[[610,786,56,46]]},
    {id:'lower-walk-east',first:5.7,on:false,cores:[[800,826,29,7,.23]],lobes:[[802,842,66,49]]},
    {id:'lower-pier',first:4.8,on:true,cores:[[950,747,12,6,.24]],lobes:[[951,790,38,92]]},
    {id:'front-west',first:6.3,on:true,minY:505,cores:[[518,515,14,7],[518,539,23,11]],lobes:[[518,528,28,31],[519,551,50,24]]},
    {id:'front-centre',first:3.6,on:false,minY:536,cores:[[794,546,17,7],[793,579,23,15]],lobes:[[794,561,34,36],[794,590,53,28]]},
    {id:'front-east',first:7.1,on:true,minY:571,cores:[[1090,581,18,7],[1085,627,25,22]],lobes:[[1090,605,36,48],[1085,646,58,34]]},
    {id:'upper-west',first:3.1,on:true,cores:[[529,366,5,10]],lobes:[[529,373,19,29]]},
    {id:'upper-centre-west',first:6.8,on:false,cores:[[694,378,5,10]],lobes:[[694,385,20,29]]},
    {id:'upper-centre-east',first:5.2,on:true,cores:[[875,390,5,10]],lobes:[[875,399,23,34]]},
    {id:'upper-east',first:2.5,on:false,cores:[[1105,407,5,10]],lobes:[[1105,420,24,39]]},
    {id:'middle-west-passage',first:7.6,on:true,cores:[[444,381,19,5,.06]],lobes:[[444,409,32,53]]},
    {id:'middle-underpass',first:4.4,on:true,cores:[[1021,465,8,11]],lobes:[[1021,479,31,43]]},
    {id:'east-service-walk',first:3.8,on:false,cores:[[1259,495,6,13]],lobes:[[1259,512,25,41]]},
    {id:'east-service-gate',first:6.1,on:true,cores:[[1279,493,10,8]],lobes:[[1280,515,30,43]]}
  ];
  function inside(x,y,polygon){
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;
    }
    return result;
  }
  function warmth(r,g,b){
    // Also includes pale incandescent cores, where R and G are almost equal.
    if(r<g-7)return 0;
    const warm=smooth((r-b-12)/28)*smooth((g-b-3)/17)*smooth((r-36)/74);
    // Clipped lamp cores can be pure white in a photographic image. Keeping
    // those pixels out of a warm-only mask leaves floating white stripes.
    const core=smooth((Math.min(r,g,b)-139)/82)*smooth((r-b+12)/12)*smooth((g-b+10)/10);
    return Math.max(warm,core);
  }
  function schedule(seed){
    const on=34+hash(seed+77)*102,off=9+hash(seed+114)*32;
    const fadeOut=.65+hash(seed+191)*1.1,fadeIn=.4+hash(seed+309)*1.1;
    const period=on+off+fadeOut+fadeIn;
    return {on,off,fadeOut,fadeIn,period,offset:hash(seed+491)*period,
      residual:.018+hash(seed+91)*.055};
  }
  function activeSchedule(seed){
    const s=schedule(seed);s.on=10+hash(seed+801)*25;s.off=4+hash(seed+809)*10;
    s.fadeOut=.17+hash(seed+812)*.25;s.fadeIn=.15+hash(seed+819)*.25;
    s.period=s.on+s.off+s.fadeOut+s.fadeIn;
    const first=1.8+hash(seed+823)*5.7;
    s.offset=hash(seed+831)<.35?s.on+s.fadeOut+s.off-first:s.on-first;
    return s;
  }
  function fixtureSchedule(index){
    const f=practicals[index],segments=[];let period=0;
    for(let i=0;i<16;i++){
      const target=(i%2===0?!f.on:f.on)?1:0,seed=index*193+i*37;
      const fade=.15+hash(seed+12)*.3,hold=target?11+hash(seed+19)*28:3.5+hash(seed+27)*13;
      segments.push({start:period,fade,hold,target});period+=fade+hold;
    }
    return {segments,period};
  }
  const fixtureSchedules=practicals.map((_,i)=>fixtureSchedule(i));
  function samplePractical(index,time){
    const f=practicals[index],s=fixtureSchedules[index],t=Number.isFinite(time)?Math.max(0,time):0;
    let power=f.on?1:0,moving=false;
    if(t>=f.first){
      const phase=(t-f.first)%s.period;
      const segment=s.segments.findLast(segment=>phase>=segment.start),elapsed=phase-segment.start;
      power=(1-segment.target)+(2*segment.target-1)*smooth(elapsed/segment.fade);moving=elapsed<segment.fade;
    }
    return {id:f.id,kind:'practical',power:.025+.975*power,moving};
  }
  function sampleWindow(window,time){
    const s=window.schedule,t=Number.isFinite(time)?Math.max(0,time):0;
    const phase=((t+s.offset)%s.period+s.period)%s.period;
    let power=1,moving=false;
    if(phase>=s.on&&phase<s.on+s.fadeOut){power=1-smooth((phase-s.on)/s.fadeOut);moving=true;}
    else if(phase>=s.on+s.fadeOut&&phase<s.on+s.fadeOut+s.off)power=0;
    else if(phase>=s.on+s.fadeOut+s.off){power=smooth((phase-s.on-s.fadeOut-s.off)/s.fadeIn);moving=true;}
    return {id:window.id,facade:window.facade,power:s.residual+(1-s.residual)*power,moving};
  }
  window.JUNCTION_LIGHTS={facades,practicals,fixtureSchedules,sampleWindow,samplePractical,schedule};
  window.createJunctionLights=photo=>{
    const W=photo.naturalWidth,H=photo.naturalHeight;
    const source=document.createElement('canvas');source.width=W;source.height=H;
    const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(photo,0,0);
    const original=sourceContext.getImageData(0,0,W,H).data,windows=[];
    const occupied=new Uint8Array(W*H),scaledX=W/1672,scaledY=H/941;
    for(let zoneIndex=0;zoneIndex<facades.length;zoneIndex++){
      const zone=facades[zoneIndex],polygon=zone.polygon.map(([x,y])=>[x*scaledX,y*scaledY]);
      const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0]))));
      const top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1]))));
      const right=Math.min(W,Math.ceil(Math.max(...polygon.map(p=>p[0]))));
      const bottom=Math.min(H,Math.ceil(Math.max(...polygon.map(p=>p[1]))));
      const width=right-left,height=bottom-top,mask=new Float32Array(width*height),visited=new Uint8Array(width*height);
      const glassTop=new Float32Array(width);
      if(zone.glassTop)for(let x=0;x<width;x++){
        // Match the photographed top edge of the ceiling strip pixel by
        // pixel, rather than leaving a white rim above a guessed polygon.
        const expected=polygon[0][1]+(polygon[1][1]-polygon[0][1])*(left+x-polygon[0][0])/(polygon[1][0]-polygon[0][0]);
        glassTop[x]=expected+2*scaledY;
        for(let y=Math.max(top,Math.floor(expected));y<Math.min(bottom,expected+9*scaledY);y++){
          const p=(y*W+left+x)*4;
          if(original[p]>195&&original[p+1]>133&&original[p+2]>65){glassTop[x]=y;break;}
        }
      }
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const global=(top+y)*W+left+x;if(occupied[global]||!inside(left+x+.5,top+y+.5,polygon))continue;
        if(zone.glassTop&&top+y<glassTop[x])continue;
        const p=global*4,value=warmth(original[p],original[p+1],original[p+2]);
        if(value>.055)mask[y*width+x]=value;
      }
      let localCount=0;
      for(let start=0;start<mask.length;start++){
        if(!mask[start]||visited[start])continue;
        const component=[start];visited[start]=1;let loX=width,loY=height,hiX=0,hiY=0,totalR=0;
        for(let cursor=0;cursor<component.length;cursor++){
          const p=component[cursor],x=p%width,y=Math.floor(p/width);
          loX=Math.min(loX,x);hiX=Math.max(hiX,x);loY=Math.min(loY,y);hiY=Math.max(hiY,y);
          totalR+=original[((top+y)*W+left+x)*4];
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const nx=x+dx,ny=y+dy,n=ny*width+nx;
            if(nx>=0&&nx<width&&ny>=0&&ny<height&&mask[n]&&!visited[n]){visited[n]=1;component.push(n);}
          }
        }
        if(component.length<zone.min)continue;
        const w=hiX-loX+1,h=hiY-loY+1;
        if(w/h>11&&h<5)continue; // Skip thin warm lintels, not rooms.
        const x=left+loX,y=top+loY,dark=document.createElement('canvas'),bright=document.createElement('canvas');
        dark.width=bright.width=w;dark.height=bright.height=h;
        const darkContext=dark.getContext('2d'),brightContext=bright.getContext('2d');
        const darkPixels=darkContext.createImageData(w,h),brightPixels=brightContext.createImageData(w,h);
        const meanR=totalR/component.length,relight=meanR<137&&component.length>3;
        let peakOpacity=0;
        for(const p of component){
          const px=p%width,py=Math.floor(p/width),global=(top+py)*W+left+px,si=global*4,di=((py-loY)*w+px-loX)*4;
          const r=original[si],g=original[si+1],b=original[si+2],luma=.2126*r+.7152*g+.0722*b;
          const alpha=Math.round(255*Math.pow(mask[p],.38));peakOpacity=Math.max(peakOpacity,alpha);
          // A cool, dim interior retains the original texture and furniture
          // contrast. Mullions have no warm emission and remain untouched.
          darkPixels.data[di]=Math.round(8+r*.16+luma*.022);
          darkPixels.data[di+1]=Math.round(13+g*.18+luma*.028);
          darkPixels.data[di+2]=Math.round(18+b*.21+luma*.035);
          darkPixels.data[di+3]=alpha;
          brightPixels.data[di]=Math.min(255,r*1.65+17);
          brightPixels.data[di+1]=Math.min(232,g*1.43+12);
          brightPixels.data[di+2]=Math.min(170,b*1.16+5);
          brightPixels.data[di+3]=alpha;
          occupied[global]=1;
        }
        darkContext.putImageData(darkPixels,0,0);brightContext.putImageData(brightPixels,0,0);
        const seed=zoneIndex*73+localCount*19+13,id=`${zone.id}-${localCount++}`,timing=zone.active?activeSchedule(seed):schedule(seed);
        if(zone.firstOut!==undefined)timing.offset=timing.on-zone.firstOut;
        if(zone.firstIn!==undefined)timing.offset=timing.on+timing.fadeOut+timing.off-zone.firstIn;
        windows.push({id,facade:zone.id,x,y,w,h,pixels:component.length,meanR,relight,
          schedule:timing,dark,bright,peakOpacity});
      }
    }
    const fixtures=practicals.map((f,index)=>{
      const shapes=[...f.cores,...f.lobes];
      const left=Math.max(0,Math.floor(Math.min(...shapes.map(s=>s[0]-s[2]))*scaledX));
      const top=Math.max(0,Math.floor(Math.max(f.minY||0,Math.min(...shapes.map(s=>s[1]-s[3])))*scaledY));
      const right=Math.min(W,Math.ceil(Math.max(...shapes.map(s=>s[0]+s[2]))*scaledX));
      const bottom=Math.min(H,Math.ceil(Math.max(...shapes.map(s=>s[1]+s[3]))*scaledY));
      const sprite=document.createElement('canvas');sprite.width=right-left;sprite.height=bottom-top;
      const p=sprite.getContext('2d'),data=p.createImageData(sprite.width,sprite.height);
      let pixels=0,corePixels=0,spillPixels=0;
      function falloff(x,y,s,core){
        const dx=x-s[0],dy=y-s[1]-(s[4]||0)*dx,d=Math.hypot(dx/s[2],dy/s[3]);
        return core?smooth((1-d)*3):smooth((1-d)*1.5);
      }
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const si=(y*W+x)*4,r=original[si],g=original[si+1],b=original[si+2];
        // Red railway signals and cyan strips belong to other lighting systems.
        if(g<r*.38||r<g-8)continue;
        const px=(x+.5)/scaledX,py=(y+.5)/scaledY;
        const core=Math.max(...f.cores.map(s=>falloff(px,py,s,true)))*smooth((r+g+b-245)/315);
        const spread=Math.max(...f.lobes.map(s=>falloff(px,py,s,false)));
        const warm=smooth((r-b-6)/36)*smooth((g-b-1)/23);
        const alpha=Math.max(core,spread*warm*.91);if(alpha<.003)continue;
        const di=((y-top)*sprite.width+x-left)*4,coreBlend=core>.001?core:0;
        const ambient=[r-Math.max(0,r-(b*.88+8))*.89,g-Math.max(0,g-(b*.96+7))*.84,b*.91];
        const darkCore=[9+r*.10,13+g*.10,17+b*.11];
        for(let c=0;c<3;c++)data.data[di+c]=Math.round(ambient[c]*(1-coreBlend)+darkCore[c]*coreBlend);
        data.data[di+3]=Math.round(alpha*255);pixels++;
        if(core>.5)corePixels++;else spillPixels++;
      }
      p.putImageData(data,0,0);
      return {id:f.id,index,x:left,y:top,w:sprite.width,h:sprite.height,sprite,pixels,corePixels,spillPixels};
    });
    function sample(time){return [...windows.map(w=>sampleWindow(w,time)),...fixtures.map(f=>samplePractical(f.index,time))];}
    function render(ctx,time){
      ctx.save();ctx.globalCompositeOperation='source-over';
      for(const w of windows){
        const state=sampleWindow(w,time),dim=1-state.power;
        if(dim>.001){ctx.globalAlpha=dim;ctx.drawImage(w.dark,w.x,w.y);}
        if(w.relight){ctx.globalAlpha=state.power*.72;ctx.drawImage(w.bright,w.x,w.y);}
      }
      for(const f of fixtures){const dim=1-samplePractical(f.index,time).power;if(dim>.001){ctx.globalAlpha=dim;ctx.drawImage(f.sprite,f.x,f.y);}}
      ctx.restore();
    }
    const metadata=windows.map(({dark,bright,...w})=>w);
    function getDiagnostics(){
      const byFacade={};for(const w of windows)byFacade[w.facade]=(byFacade[w.facade]||0)+1;
      return {model:'source-window-components',windows:windows.length,facades:Object.keys(byFacade).length,
        windowPixels:windows.reduce((sum,w)=>sum+w.pixels,0),relitWindows:windows.filter(w=>w.relight).length,
        practicalFixtures:fixtures.length,practicalPixels:fixtures.reduce((n,f)=>n+f.pixels,0),
        practicals:fixtures.map(({sprite,...f})=>({...f,firstChange:practicals[f.index].first})),
        byFacade,changesInFirst15Seconds:windows.filter(w=>Math.abs(sampleWindow(w,0).power-sampleWindow(w,15).power)>.4).length};
    }
    return {render,sample,getDiagnostics,windows:metadata,practicals:fixtures.map(({sprite,...f})=>f)};
  };
})();
