/* Photographed blades, rectified into their own rotor plane before rotation. */
(() => {
  'use strict';
  const TAU=Math.PI*2;
  const clamp=value=>Math.max(0,Math.min(1,value));
  const rotors=Object.freeze([
    Object.freeze({id:'west-service-turbine',cx:460.5,cy:447.5,rx:61.8,ry:102.2,shear:3.2,speed:.235,phase:0,hub:{cx:462.1,cy:447.4,rx:16.1,ry:23.8},size:384}),
    Object.freeze({id:'mid-city-turbine',cx:785.6,cy:421.9,rx:12.25,ry:34.3,shear:.5,speed:-.313,phase:.19,hub:{cx:785.4,cy:421.7,rx:3.05,ry:4.8},size:144}),
  ]);
  function project(rotor,u,v){return{x:rotor.cx+rotor.rx*u+rotor.shear*v,y:rotor.cy+rotor.ry*v};}
  function unproject(rotor,x,y){const v=(y-rotor.cy)/rotor.ry;return{u:(x-rotor.cx-rotor.shear*v)/rotor.rx,v};}
  function angle(rotor,time){const t=Number.isFinite(time)?Math.max(0,time):0;return ((rotor.phase+t*rotor.speed)%TAU+TAU)%TAU;}
  function sample(time){return rotors.map(r=>({id:r.id,angle:angle(r,time),speed:r.speed,cx:r.cx,cy:r.cy}));}
  function coverage(radius,r){
    // A circular hole in the rectified plane keeps the original bearing cap
    // and its immediate attachment ring stationary at every rotation angle.
    return clamp((radius-.292)/(.65/r.ry))*clamp((1-radius)/(.8/r.ry));
  }
  function diskMask(c,size,r){
    const half=size/2,pixels=c.getImageData(0,0,size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const radius=Math.hypot((x+.5-half)/half,(y+.5-half)/half);
      pixels.data[(y*size+x)*4+3]=Math.round(255*coverage(radius,r));
    }
    c.putImageData(pixels,0,0);
  }
  function rotorTexture(photo,r){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=r.size;
    const c=canvas.getContext('2d');const half=r.size/2;
    const a=half/r.rx,b=-half*r.shear/(r.rx*r.ry),d=half/r.ry;
    c.setTransform(a,0,b,d,half-a*r.cx-b*r.cy,half-d*r.cy);
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(photo,0,0);
    c.setTransform(1,0,0,1,0,0);
    diskMask(c,r.size,r);
    return canvas;
  }
  function hubTexture(photo,r){
    const h=r.hub,rx=h.rx+1,ry=h.ry+1;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(rx*2);canvas.height=Math.ceil(ry*2);
    const c=canvas.getContext('2d');c.drawImage(photo,h.cx-rx,h.cy-ry,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
    const pixels=c.getImageData(0,0,canvas.width,canvas.height);
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const distance=Math.hypot((x+.5-rx)/h.rx,(y+.5-ry)/h.ry);
      pixels.data[(y*canvas.width+x)*4+3]=Math.round(255*clamp((1-distance)*Math.min(h.rx,h.ry)/.65));
    }
    c.putImageData(pixels,0,0);return{canvas,x:h.cx-rx,y:h.cy-ry};
  }
  window.CLOUDCITY_TURBINES={rotors,project,unproject,angle,sample,coverage};
  window.createCloudcityTurbines=photo=>{
    const sprites=rotors.map(r=>({rotor:rotorTexture(photo,r),hub:hubTexture(photo,r)}));
    let lastTime=0;
    function render(ctx,time,strength=1){
      lastTime=Number.isFinite(time)?Math.max(0,time):0;
      const alpha=Number.isFinite(strength)?clamp(strength):1;if(alpha===0)return;
      ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;
      for(let i=0;i<rotors.length;i++){
        const r=rotors[i],sprite=sprites[i];
        ctx.save();ctx.translate(r.cx,r.cy);ctx.transform(r.rx,0,r.shear,r.ry,0,0);ctx.rotate(angle(r,lastTime));
        ctx.drawImage(sprite.rotor,-1,-1,2,2);ctx.restore();
        // The bearing cap stays fixed in the photographed housing.
        ctx.drawImage(sprite.hub.canvas,sprite.hub.x,sprite.hub.y);
      }
      ctx.restore();
    }
    return{render,getDiagnostics:()=>({model:'photo-textured-perspective-rotors',count:rotors.length,stationaryHousings:true,stationaryBearings:true,sample:sample(lastTime)})};
  };
})();
