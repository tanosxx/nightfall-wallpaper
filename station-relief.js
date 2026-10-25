/* Fixed-camera 2.5D lighting: hand-shaped normals, measured masks and a real
 * fragment shader. Cairo uses the same response baked at 12 light directions. */
(() => {
  'use strict';
  const root='assets/station-relief/';
  const makeCanvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const load=name=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Missing relief asset: '+name));i.src=root+name;});
  function tint(image,color){const c=makeCanvas(image.width,image.height),p=c.getContext('2d');p.drawImage(image,0,0);p.globalCompositeOperation='source-in';p.fillStyle=color;p.fillRect(0,0,c.width,c.height);return c;}
  function gpu(photo,normal,material,sectors,meta){
    const c=makeCanvas(meta.width,meta.height),gl=c.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,depth:false,stencil:false});
    if(!gl)return null;
    const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}`;
    const fragment=`precision highp float;
      varying vec2 uv;uniform sampler2D photo,normalMap,materialMap,ring,spine,hangar;
      uniform vec3 lightA,lightB,keyColor,weights;uniform float blend,darkness,key,scanPosition,scanWidth,scanGain;
      float response(vec3 n,vec3 l,float rough){vec3 halfLight=normalize(l+vec3(0.,0.,1.));return clamp(.62*max(dot(n,l),0.)+.65*pow(max(dot(n,halfLight),0.),mix(44.,7.,rough))*(1.-rough)*.4,0.,1.);}
      void main(){vec3 base=texture2D(photo,uv).rgb;vec4 material=texture2D(materialMap,uv);vec3 m=material.rgb;
        vec3 n=normalize(texture2D(normalMap,uv).rgb*2.-1.);
        float surface=m.r*(1.-m.b);
        float regional=min(dot(vec3(texture2D(ring,uv).a,texture2D(spine,uv).a,texture2D(hangar,uv).a),weights),max(.001,max(weights.x,max(weights.y,weights.z))));
        float r=mix(response(n,lightA,m.g),response(n,lightB,m.g),blend)*surface*regional*material.a;
        base*=1.-darkness*surface;base=mix(base,keyColor,clamp(r*key,0.,1.));
        float scan=max(0.,1.-abs((uv.x-scanPosition)/scanWidth));
        base=mix(base,vec3(.72,.90,1.),clamp(r*scanGain*scan,0.,1.));gl_FragColor=vec4(base,1.);
      }`;
    function shader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const names=['photo','normalMap','materialMap','ring','spine','hangar'];
    [photo,normal,material,...sectors].forEach((img,i)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.uniform1i(gl.getUniformLocation(program,names[i]),i);});
    const uniforms=Object.fromEntries(['lightA','lightB','keyColor','weights','blend','darkness','key','scanPosition','scanWidth','scanGain'].map(k=>[k,gl.getUniformLocation(program,k)]));
    return {canvas:c,render(s,a,b,f){if(gl.isContextLost())return false;gl.uniform3fv(uniforms.lightA,meta.directions[a]);gl.uniform3fv(uniforms.lightB,meta.directions[b]);gl.uniform3fv(uniforms.keyColor,s.keyColor.map(v=>v/255));gl.uniform3fv(uniforms.weights,s.sectorWeights);for(const k of ['darkness','key','scanPosition','scanWidth','scanGain'])gl.uniform1f(uniforms[k],s[k]);gl.uniform1f(uniforms.blend,f);gl.viewport(0,0,c.width,c.height);gl.drawArrays(gl.TRIANGLES,0,6);return true;}};
  }
  window.createStationRelief=async(photo,meta,{forceCanvas=false}={})=>{
    const [normal,material,dark,...rest]=await Promise.all([meta.normal,meta.material,meta.dark,...meta.sectors.map(s=>s.path),...meta.layers,...meta.welds.map(w=>w.path)].map(load));
    const sectors=rest.slice(0,3),layers=rest.slice(3,15),welds=rest.slice(15).map(i=>tint(i,'rgb(115,196,242)'));
    const canvas=makeCanvas(meta.width,meta.height),ctx=canvas.getContext('2d');let gpuRenderer=null;
    try{if(!forceCanvas)gpuRenderer=gpu(photo,normal,material,sectors,meta);}catch(error){console.warn('Station uses Canvas lighting fallback:',error);}
    const mixCanvas=makeCanvas(meta.width,meta.height),mixCtx=mixCanvas.getContext('2d');
    const regionCanvas=makeCanvas(meta.width,meta.height),regionCtx=regionCanvas.getContext('2d');
    let previous='',backend=gpuRenderer?'webgl':'canvas';
    const renderer={canvas,welds,get backend(){return backend;},render(s){
      const signature=JSON.stringify([s.direction,s.darkness,s.key,s.keyColor,s.sectorWeights,s.scanGain,s.scanGain?s.scanPosition:0]);if(signature===previous)return false;previous=signature;
      let angle=(Math.atan2(s.direction[1],s.direction[0])/(Math.PI*2)+1)%1*12;const a=Math.floor(angle),b=(a+1)%12,f=angle-a;
      if(gpuRenderer?.render(s,a,b,f)){ctx.globalCompositeOperation='copy';ctx.drawImage(gpuRenderer.canvas,0,0);ctx.globalCompositeOperation='source-over';return true;}
      backend='canvas';
      ctx.globalCompositeOperation='copy';ctx.drawImage(photo,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=s.darkness;ctx.drawImage(dark,0,0);ctx.globalAlpha=1;
      mixCtx.clearRect(0,0,canvas.width,canvas.height);mixCtx.globalCompositeOperation='lighter';mixCtx.globalAlpha=1-f;mixCtx.drawImage(layers[a],0,0);mixCtx.globalAlpha=f;mixCtx.drawImage(layers[b],0,0);mixCtx.globalAlpha=1;
      const maximum=Math.max(.001,...s.sectorWeights);regionCtx.clearRect(0,0,canvas.width,canvas.height);regionCtx.globalCompositeOperation='lighter';sectors.forEach((img,i)=>{regionCtx.globalAlpha=s.sectorWeights[i]/maximum;regionCtx.drawImage(img,0,0);});regionCtx.globalAlpha=1;
      mixCtx.globalCompositeOperation='destination-in';mixCtx.drawImage(regionCanvas,0,0);mixCtx.globalCompositeOperation='source-in';mixCtx.fillStyle=`rgb(${s.keyColor.join(',')})`;mixCtx.fillRect(0,0,canvas.width,canvas.height);mixCtx.globalCompositeOperation='source-over';
      ctx.globalAlpha=Math.min(1,s.key*maximum);ctx.drawImage(mixCanvas,0,0);ctx.globalAlpha=1;
      if(s.scanGain>0){const x=s.scanPosition*canvas.width,w=s.scanWidth*canvas.width,g=mixCtx.createLinearGradient(x-w,0,x+w,0);g.addColorStop(0,'rgba(184,230,255,0)');g.addColorStop(.5,'rgb(184,230,255)');g.addColorStop(1,'rgba(184,230,255,0)');mixCtx.globalCompositeOperation='source-in';mixCtx.fillStyle=g;mixCtx.fillRect(0,0,canvas.width,canvas.height);mixCtx.globalCompositeOperation='source-over';ctx.globalAlpha=Math.min(1,s.scanGain*maximum);ctx.drawImage(mixCanvas,0,0);ctx.globalAlpha=1;}
      return true;
    }};return renderer;
  };
})();
