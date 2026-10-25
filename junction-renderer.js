/* Photographic rolling stock, source-aligned tracks and moving reflected light. */
(() => {
  'use strict';
  const DATA=window.JUNCTION_DATA,MOTION=window.JUNCTION_MOTION;
  const visibleTracks=Object.freeze(['upper']);
  const root=new URL('.',document.currentScript.src);
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const crops={coach:[17,174,2066,402],cab:[15,159,2068,412]};
  function polygon(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
  function routePoint(id,u){
    const route=DATA.routes.find(r=>r.id===id),k=id==='lower'?1.38:1.13;
    const s=u/(k+(1-k)*u),p=DATA.routeAt(route,clamp(s));
    if(s<0||s>1){const delta=(s-clamp(s))*(route.end[0]-route.start[0]);p.x+=delta;p.y+=delta*p.slope;}
    return p;
  }
  function carGeometry(train,index){
    const spacing=train.span/train.cars,center=train.head-(index+.5)*spacing;
    const u=train.direction===1?center:1-center,half=spacing*.487;
    const a=routePoint(train.id,u-half),b=routePoint(train.id,u+half),p=routePoint(train.id,u);
    // The photographed sprite ends at the visible near wheels, not the track
    // centre. Seat those wheels on the near rail at every perspective depth.
    for(const point of [a,b,p])point.y+=point.halfGauge;
    const width=b.x-a.x,height=1.23*width/(crops.coach[2]/crops.coach[3]);
    return {a,b,p,u,width,height,slope:(b.y-a.y)/width,
      visible:u+half>=0&&u-half<=1,direction:index===train.cars-1?-train.direction:train.direction,
      cab:index===0||index===train.cars-1};
  }
  function glow(ctx,x,y,rx,ry,colour,alpha){
    if(alpha<.001)return;
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const g=ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,`rgba(${colour},${alpha})`);g.addColorStop(.35,`rgba(${colour},${alpha*.46})`);g.addColorStop(1,`rgba(${colour},0)`);
    ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function signals(ctx,state,time){
    for(const f of DATA.signals){
      const s=state.signals.find(s=>s.id===f.id),r=f.scale;
      ctx.save();ctx.lineWidth=2.3*r;ctx.strokeStyle='#141d21';
      ctx.beginPath();ctx.moveTo(...f.base);ctx.lineTo(f.x,f.y+8*r);ctx.stroke();
      ctx.strokeStyle='rgba(137,164,169,.35)';ctx.lineWidth=.55*r;
      ctx.beginPath();ctx.moveTo(f.base[0]-.7*r,f.base[1]);ctx.lineTo(f.x-.7*r,f.y+7*r);ctx.stroke();
      ctx.fillStyle='#0a1014';ctx.fillRect(f.x-3.1*r,f.y-7*r,6.2*r,16*r);
      ctx.strokeStyle='#3c4b50';ctx.lineWidth=.6*r;ctx.strokeRect(f.x-3.1*r,f.y-7*r,6.2*r,16*r);
      ['red','amber','green'].forEach((colour,i)=>{
        const rgb=colour==='red'?'255,67,40':colour==='amber'?'255,184,61':'103,237,164';
        const pulse=colour==='red'?.2+.8*window.JUNCTION_BEACONS.power(time,3.1+DATA.signals.indexOf(f)*.19,DATA.signals.indexOf(f)*.47):1;
        const power=s.levels[colour]*pulse,y=f.y+(i-1)*4.8*r;
        ctx.fillStyle=`rgba(${rgb},${.08+power*.87})`;ctx.beginPath();ctx.arc(f.x,y,1.45*r,0,Math.PI*2);ctx.fill();
        ctx.globalCompositeOperation='screen';glow(ctx,f.x,y,8*r,8*r,rgb,power*.32);
        ctx.globalCompositeOperation='source-over';
      });ctx.restore();
    }
  }
  function points(ctx,state){
    for(const f of DATA.switches){
      const s=state.switches.find(s=>s.id===f.id),offset=(s.position-.5)*2.3*f.scale;
      ctx.save();ctx.lineCap='round';ctx.lineWidth=.9*f.scale;ctx.strokeStyle='rgba(163,180,180,.70)';
      for(let i=0;i<f.blades.length;i++){
        const p=f.blades[i];ctx.beginPath();ctx.moveTo(...p[0]);
        ctx.quadraticCurveTo(p[1][0]+offset,p[1][1],p[2][0]+offset*1.7,p[2][1]);ctx.stroke();
      }
      const [x,y]=f.indicator;ctx.fillStyle='#141d22';ctx.fillRect(x-2.5*f.scale,y-2*f.scale,5*f.scale,4*f.scale);
      ctx.strokeStyle=s.moving?'#c7a366':'#a0beb7';ctx.lineWidth=.9*f.scale;ctx.beginPath();
      ctx.moveTo(x-1.6*f.scale,y);ctx.lineTo(x+1.6*f.scale,y-offset*1.1);ctx.stroke();ctx.restore();
    }
  }
  function reflectedLight(ctx,train,cars){
    const lower=train.id==='lower';
    const facades=DATA.facades.filter(f=>lower?f.id.startsWith('lower-')||f.id.endsWith('-wall'):f.id==='upper-front');
    for(const surface of facades){
      ctx.save();polygon(ctx,surface.polygon);ctx.clip();ctx.globalCompositeOperation='screen';
      for(const c of cars){
        if(!c.visible)continue;
        glow(ctx,c.p.x,c.p.y+(lower?55:22),c.width*.65,lower?138:45,'226,159,83',surface.gain*.69);
        // Individual windows cast broad soft stripes, never black dimmers.
        for(let j=1;j<8;j++){
          const x=c.a.x+c.width*j/8,y=c.a.y+(x-c.a.x)*c.slope;
          glow(ctx,x,y+(lower?45:14),c.width*.032,lower?100:33,'244,177,95',surface.gain*.45);
        }
      }
      const hu=train.direction===1?train.head:1-train.head;
      if(hu>-.12&&hu<1.12){const h=routePoint(train.id,hu);
        glow(ctx,h.x+train.direction*65,h.y+(lower?25:12),lower?120:75,lower?98:30,'172,206,218',surface.gain*.7);}
      ctx.restore();
    }
  }
  function train(ctx,photo,stock,state){
    const route=DATA.routes.find(r=>r.id===state.id),cars=Array.from({length:state.cars},(_,i)=>carGeometry(state,i));
    reflectedLight(ctx,state,cars);
    ctx.save();ctx.beginPath();ctx.rect(route.start[0],0,route.end[0]-route.start[0],DATA.H);ctx.clip();
    // Cut the train around real columns without restoring an old photograph
    // over animated windows, lamps or traffic already drawn underneath it.
    ctx.beginPath();ctx.rect(0,0,DATA.W,DATA.H);
    for(const shape of route.occlusion){shape.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
    ctx.clip('evenodd');
    // The narrow contact shadow stays attached to the wheel/rail plane.
    for(const c of cars)if(c.visible){
      ctx.save();ctx.transform(1,c.slope,0,1,c.a.x,c.a.y);ctx.fillStyle='rgba(4,10,13,.40)';
      ctx.beginPath();ctx.ellipse(c.width*.5,0,c.width*.48,Math.max(1.2,c.height*.065),0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    // Farther cars first, so increasing perspective overlaps naturally.
    for(const c of cars.filter(c=>c.visible).sort((a,b)=>a.p.x-b.p.x)){
      const crop=crops[c.cab?'cab':'coach'],image=stock[c.cab?'cab':'coach'];
      ctx.save();const d=c.direction,origin=d===1?c.a:c.b;
      ctx.transform(d,d*c.slope,0,1,origin.x,origin.y);
      ctx.globalAlpha=state.id==='upper'?.88:1;
      ctx.drawImage(image,...crop,0,-c.height,c.width,c.height);
      ctx.restore();
    }
    // Headlamps and the last cab's red markers follow the actual moving ends.
    for(const [rear,distance] of [[false,state.head],[true,state.head-state.span]]){
      const u=state.direction===1?distance:1-distance;if(u<0||u>1)continue;
      const p=routePoint(state.id,u),c=cars[rear?cars.length-1:0],y=p.y+p.halfGauge-c.height*.34;
      ctx.globalCompositeOperation='screen';
      const rgb=rear?'238,58,38':'193,220,231';
      glow(ctx,p.x-state.direction*(rear?-2:3),y,c.height*.22,c.height*.15,rgb,rear?.40:.52);
      ctx.globalCompositeOperation='source-over';
    }
    ctx.restore();
  }
  function loadImage(file){return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Cannot load ${file}`));img.src=new URL(file,root).href;
  });}
  window.JUNCTION_RENDER={routePoint,carGeometry,crops,visibleTracks};
  window.createJunctionScene=photo=>{
    const atmosphere=window.createJunctionAtmosphere(photo),lights=window.createJunctionLights(photo),
      traffic=window.createJunctionTraffic(photo),beacons=window.createJunctionBeacons(photo),stock={};
    const ready=Promise.all([loadImage('assets/junction-coach.png'),loadImage('assets/junction-cab.png'),atmosphere.ready]).then(([coach,cab])=>{stock.coach=coach;stock.cab=cab;});
    function render(ctx,time,strength=.6){
      time=Number.isFinite(time)?Math.max(0,time):0;const state=MOTION.sample(time);
      ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(photo,0,0);
      atmosphere.renderBase?.(ctx,time);
      lights.render(ctx,time);
      points(ctx,state);signals(ctx,state,time);
      beacons.render(ctx,time);
      traffic.render(ctx,time,strength);
      if(stock.coach&&stock.cab)for(const id of visibleTracks){
        const current=state.trains.find(t=>t.id===id);if(current.active)train(ctx,photo,stock,current);
      }
      atmosphere.render(ctx,time,strength);ctx.restore();
    }
    return {ready,render,getDiagnostics:()=>({visibleTracks,lights:lights.getDiagnostics?.(),traffic:traffic.getDiagnostics?.(),atmosphere:atmosphere.getDiagnostics?.(),beacons:beacons.getDiagnostics?.()})};
  };
})();
