/* Source-aligned positive light layers. No dark polygons are drawn per frame. */
(() => {
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
  const rectBounds=points=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {x:Math.floor(Math.min(...xs)),y:Math.floor(Math.min(...ys)),w:Math.ceil(Math.max(...xs)-Math.min(...xs))+1,h:Math.ceil(Math.max(...ys)-Math.min(...ys))+1};};
  function paneCoverage(points,x,y,feather=1.1){
    let inside=false,distance=Infinity;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[j],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy));
      distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
    }
    return inside?smooth(distance/feather):0;
  }
  window.createAbyssRadiance=(photo,data,practicals)=>{
    const W=photo.naturalWidth,H=photo.naturalHeight,base=canvas(W,H),bp=base.getContext('2d',{willReadFrequently:true});bp.drawImage(photo,0,0);
    const source=bp.getImageData(0,0,W,H),pixels=source.data;
    const soft=canvas(W,H),sp=soft.getContext('2d',{willReadFrequently:true});sp.filter='blur(9px)';sp.drawImage(photo,0,0);sp.filter='none';const blurred=sp.getImageData(0,0,W,H).data;
    const emitters=[],totals=new Uint16Array(W*H*3);
    const read=(a,x,y,c)=>a[(clamp(Math.round(y),0,H-1)*W+clamp(Math.round(x),0,W-1))*4+c];
    function add(kind,index,bounds,compute){
      const x=clamp(bounds.x,0,W-1),y=clamp(bounds.y,0,H-1),w=Math.min(bounds.w,W-x),h=Math.min(bounds.h,H-y),tex=canvas(w,h),p=tex.getContext('2d'),im=p.createImageData(w,h);
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
        const X=x+xx,Y=y+yy,n=(yy*w+xx)*4,s=(Y*W+X)*4,out=compute(X,Y,[pixels[s],pixels[s+1],pixels[s+2]]);
        for(let c=0;c<3;c++){const amount=Math.round(clamp(out[c],0,pixels[s+c]));im.data[n+c]=amount;totals[(Y*W+X)*3+c]+=amount;}im.data[n+3]=255;
      }
      emitters.push({kind,index,x,y,w,h,tex,p,im});
    }
    function warmResidual(bounds,strength=1){return (x,y,rgb)=>{
      const [r,g,b]=rgb,warm=Math.max(smooth((r-b-3)/32),smooth((Math.min(r,g,b)-125)/90))*smooth((r-28)/75);
      // An ROI ends in a mullion/dark seam; only warm radiance inside it changes.
      const edge=smooth(Math.min(x-bounds.x+.5,bounds.x+bounds.w-x-.5,y-bounds.y+.5,bounds.y+bounds.h-y-.5)/1.2);
      const ambient=Math.max(16,Math.min(27,b*.24)),target=[ambient*.85,ambient,ambient*1.12];
      return rgb.map((v,c)=>Math.max(0,v-target[c])*warm*edge*strength);
    };}
    // Treat each glass pane as one room: the illumination of furniture and
    // curtains falls together, without colour-keyed holes around bright pixels.
    data.windows.forEach((f,i)=>{const b=rectBounds(f.points);add('windows',i,b,(x,y,rgb)=>{
      const coverage=paneCoverage(f.points,x+.5,y+.5);
      return rgb.map((v,c)=>v*[.76,.73,.68][c]*coverage);
    });});
    // Broad measured coverage is only a search area. A low-frequency excess
    // above adjacent ambient pixels determines the actual photographed light.
    data.worklamps.forEach((f,i)=>{
      const b={x:Math.floor(Math.min(f.x-f.beam.width*1.35,f.beam.endX-f.beam.width*1.3)),y:Math.floor(f.y+3),w:0,h:Math.ceil(f.beam.endY-f.y+12)};
      b.w=Math.ceil(Math.max(f.x+f.beam.width*1.35,f.beam.endX+f.beam.width*1.3)-b.x);
      // Nearby windows must not change the ambient estimate for a whole row.
      // Blend both sides continuously, then smooth their profile vertically.
      const profile=Array.from({length:b.h},(_,row)=>{
        const y=b.y+row,t=clamp((y-f.y)/(f.beam.endY-f.y));
        const center=f.x+(f.beam.endX-f.x)*t,radius=f.rx+17+(f.beam.width-f.rx+14)*Math.sqrt(t);
        const sides=[-1,1].map(sign=>[0,1,2].map(c=>read(blurred,center+sign*(radius+10),y,c)));
        const weights=sides.map(s=>Math.exp(-Math.max(0,s[0]-s[2]-4)/13)/(18+luma(...s)));
        return [0,1,2].map(c=>(sides[0][c]*weights[0]+sides[1][c]*weights[1])/(weights[0]+weights[1]));
      });
      const ambientProfile=profile.map((_,row)=>{
        const sum=[0,0,0];let total=0;
        for(let k=-28;k<=28;k++){const weight=Math.exp(-k*k/(2*13*13)),s=profile[clamp(row+k,0,b.h-1)];total+=weight;for(let c=0;c<3;c++)sum[c]+=s[c]*weight;}
        return sum.map(v=>v/total);
      });
      add('worklamps',i,b,(x,y,rgb)=>{
        const t=clamp((y-f.y)/(f.beam.endY-f.y)),center=f.x+(f.beam.endX-f.x)*t;
        // Wider than the visible beam: no dark cone inside a still-lit cone.
        const radius=f.rx+17+(f.beam.width-f.rx+14)*Math.sqrt(t);
        const lateral=Math.abs(x-center)/radius;
        const support=1-smooth((lateral-.65)/.55),vertical=smooth((y-f.y-2)/5)*(1-smooth((t-.88)/.18));
        const low=[0,1,2].map(c=>read(blurred,x,y,c));
        const side=ambientProfile[y-b.y];
        const cold=1-smooth((rgb[0]-rgb[2]-6)/24);
        return rgb.map((v,c)=>{
          const floor=Math.max(side[c],low[c]*.20,[6,13,19][c]);
          const excess=Math.max(0,low[c]-floor);
          return Math.min(v*.80,excess)*support*vertical*cold;
        });
      });
      const core={x:Math.floor(f.x-f.rx-4),y:Math.floor(f.y-f.ry-4),w:Math.ceil(f.rx*2+9),h:Math.ceil(f.ry*2+9)};
      add('worklamps',i,core,(x,y,rgb)=>{
        const ellipse=Math.pow((x-f.x)/(f.rx+3),4)+Math.pow((y-f.y)/(f.ry+2),4);
        const mask=Math.exp(-ellipse)*smooth((Math.min(...rgb)-48)/105);
        return rgb.map((v,c)=>Math.max(0,v-[13,20,25][c])*mask);
      });
    });
    (practicals?.lamps||[]).forEach((f,i)=>{
      const radius=f.halo||9,rx=Math.max(f.rx||1.5,1),ry=Math.max(f.ry||1.5,1),b={x:Math.floor(f.x-radius),y:Math.floor(f.y-radius),w:Math.ceil(radius*2+1),h:Math.ceil(radius*2+1)};
      add('amber',i,b,(x,y,rgb)=>{
        const d=Math.hypot(x-f.x,y-f.y),halo=Math.exp(-Math.pow(d/(radius*.53),2)),core=Math.exp(-Math.pow((x-f.x)/(rx+1),4)-Math.pow((y-f.y)/(ry+1),4));
        const residual=warmResidual(b)(x,y,rgb);return residual.map(v=>v*Math.max(core,halo*.85));
      });
      if(f.beam){
        const beam=f.beam,extent=beam.width*1.4;
        const surface={x:Math.floor(Math.min(f.x,beam.endX)-extent),y:Math.floor(f.y+2),w:Math.ceil(Math.abs(beam.endX-f.x)+extent*2),h:Math.ceil(beam.endY-f.y+15)};
        add('amber',i,surface,(x,y,rgb)=>{
          const t=clamp((y-f.y)/(beam.endY-f.y)),center=f.x+(beam.endX-f.x)*t;
          const radius=f.rx+6+(beam.width-f.rx)*Math.sqrt(t);
          const support=Math.exp(-Math.pow(Math.abs(x-center)/(radius*.78),4));
          const vertical=smooth((y-f.y-1)/4)*(1-smooth((t-.68)/.36));
          const low=[0,1,2].map(c=>read(blurred,x,y,c));
          const warm=smooth((low[0]-low[2]-2)/25);
          const receiver=beam.points?paneCoverage(beam.points,x+.5,y+.5,6):1;
          return rgb.map((v,c)=>Math.min(v*.78,Math.max(0,low[c]-[18,24,29][c]))*support*vertical*warm*receiver);
        });
      }
    });
    data.beacons.forEach((f,i)=>{
      const b={x:Math.floor(f.x-9),y:Math.floor(f.y-9),w:19,h:19};
      add('beacons',i,b,(x,y,rgb)=>{const [r,g,blue]=rgb,mask=smooth((r-Math.max(g,blue)-3)/40)*Math.exp(-Math.pow(Math.hypot(x-f.x,y-f.y)/7,2));return rgb.map((v,c)=>Math.max(0,v-[8,13,19][c])*mask);});
    });
    // Share overlapping emitter budgets so subtraction never invents a black
    // pixel. Then reconstruct the exact original using only positive additions.
    const sum=new Uint16Array(W*H*3);
    for(const e of emitters){for(let yy=0;yy<e.h;yy++)for(let xx=0;xx<e.w;xx++){
      const n=(yy*e.w+xx)*4,p=((e.y+yy)*W+e.x+xx),s=p*4;
      for(let c=0;c<3;c++){
        const budget=Math.max(0,pixels[s+c]-Math.min(pixels[s+c],Math.max([5,9,14][c],pixels[s+c]*.22)));
        const ratio=Math.min(1,budget/Math.max(1,totals[p*3+c]));
        e.im.data[n+c]=Math.floor(e.im.data[n+c]*ratio);sum[p*3+c]+=e.im.data[n+c];
      }
    }e.p.putImageData(e.im,0,0);delete e.im;delete e.p;}
    const ambient=bp.createImageData(W,H);let reconstructionError=0,affected=0;
    for(let p=0;p<W*H;p++){
      let changed=false;for(let c=0;c<3;c++){ambient.data[p*4+c]=pixels[p*4+c]-sum[p*3+c];reconstructionError=Math.max(reconstructionError,Math.abs(ambient.data[p*4+c]+sum[p*3+c]-pixels[p*4+c]));changed||=sum[p*3+c]>0;}ambient.data[p*4+3]=255;if(changed)affected++;
    }
    bp.putImageData(ambient,0,0);
    const frame=canvas(W,H),p=frame.getContext('2d');
    function render(ctx,time,options={}){
      const state=data.sample(time),amber=practicals?.sample(time)||[],override=options.override;
      p.globalCompositeOperation='copy';p.globalAlpha=1;p.drawImage(base,0,0);p.globalCompositeOperation='lighter';
      for(const e of emitters){const power=override==='on'?1:override==='off'?0:e.kind==='amber'?amber[e.index]:e.kind==='beacons'?state.beacons[e.index]:1-state[e.kind][e.index];p.globalAlpha=clamp(power);if(p.globalAlpha>.0001)p.drawImage(e.tex,e.x,e.y);}
      p.globalAlpha=1;p.globalCompositeOperation='source-over';ctx.drawImage(frame,0,0);
    }
    return {render,canvas:frame,base,supportsOverride:true,getDiagnostics:()=>({model:'positive-source-radiance',emitters:emitters.length,affectedPixels:affected,allOnReconstructionError:reconstructionError,negativeLightPixels:0})};
  };
})();
