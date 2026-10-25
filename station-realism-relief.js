/* Photographic lighting: preserve measured texture contrast; only local
 * increments are added. This preview leaves the installed renderer unchanged. */
(() => {
  'use strict';
  const root='assets/station-relief/';
  const makeCanvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const load=name=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Missing relief asset: '+name));i.src=root+name;});
  // Build an additive light response from the photographed material, not a
  // flat coloured patch. Bright and dark metal keep their texture differences.
  function materialIncrement(photo,mask,rect,color,energy){
    const c=makeCanvas(mask.width,mask.height),p=c.getContext('2d');
    p.drawImage(photo,rect.x,rect.y,c.width,c.height,0,0,c.width,c.height);
    const pixels=p.getImageData(0,0,c.width,c.height);
    const m=makeCanvas(c.width,c.height),q=m.getContext('2d');q.drawImage(mask,0,0);const weights=q.getImageData(0,0,c.width,c.height).data;
    const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    const display=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
    for(let i=0;i<pixels.data.length;i+=4){for(let k=0;k<3;k++){const source=pixels.data[i+k]/255,target=display(Math.min(1,linear(source)*(1+energy*color[k])));pixels.data[i+k]=Math.round(Math.max(0,target-source)*255);}pixels.data[i+3]=weights[i+3];}
    p.putImageData(pixels,0,0);return c;
  }
  window.createStationMaterialIncrement=materialIncrement;
  function gpu(photo,normal,material,sectors,meta){
    const c=makeCanvas(meta.width,meta.height),gl=c.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,depth:false,stencil:false});
    if(!gl)return null;
    const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}`;
    const fragment=`precision highp float;
      varying vec2 uv;uniform sampler2D photo,normalMap,materialMap,ring,spine,hangar;
      uniform vec3 lightA,lightB,keyColor,weights;uniform float blend,darkness,key;
      float response(vec3 n,vec3 l,float rough){vec3 halfLight=normalize(l+vec3(0.,0.,1.));return clamp(.62*max(dot(n,l),0.)+.65*pow(max(dot(n,halfLight),0.),mix(44.,7.,rough))*(1.-rough)*.4,0.,1.);}
      void main(){vec3 base=texture2D(photo,uv).rgb;vec4 material=texture2D(materialMap,uv);vec3 m=material.rgb;
        vec3 n=normalize(texture2D(normalMap,uv).rgb*2.-1.);
        float surface=m.r*(1.-m.b);
        float regional=min(dot(vec3(texture2D(ring,uv).a,texture2D(spine,uv).a,texture2D(hangar,uv).a),weights),max(.001,max(weights.x,max(weights.y,weights.z))));
        float r=mix(response(n,lightA,m.g),response(n,lightB,m.g),blend)*surface*regional*material.a;
        vec3 increment=base*keyColor*(r*key);base=base*(1.-darkness*surface)+increment;
        gl_FragColor=vec4(base,1.);
      }`;
    function shader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const names=['photo','normalMap','materialMap','ring','spine','hangar'];
    [photo,normal,material,...sectors].forEach((img,i)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.uniform1i(gl.getUniformLocation(program,names[i]),i);});
    const uniforms=Object.fromEntries(['lightA','lightB','keyColor','weights','blend','darkness','key'].map(k=>[k,gl.getUniformLocation(program,k)]));
    return {canvas:c,render(s,a,b,f){if(gl.isContextLost())return false;gl.uniform3fv(uniforms.lightA,meta.directions[a]);gl.uniform3fv(uniforms.lightB,meta.directions[b]);gl.uniform3fv(uniforms.keyColor,s.keyColor.map(v=>v/255));gl.uniform3fv(uniforms.weights,s.sectorWeights);for(const k of ['darkness','key'])gl.uniform1f(uniforms[k],s[k]);gl.uniform1f(uniforms.blend,f);gl.viewport(0,0,c.width,c.height);gl.drawArrays(gl.TRIANGLES,0,6);return true;}};
  }
  window.createStationRelief=async(photo,meta,{forceCanvas=false}={})=>{
    const [normal,material,dark,...rest]=await Promise.all([meta.normal,meta.material,meta.dark,...meta.sectors.map(s=>s.path),...meta.layers,...meta.welds.map(w=>w.path)].map(load));
    const sectors=rest.slice(0,3),layers=rest.slice(3,15),welds=rest.slice(15).map((i,n)=>materialIncrement(photo,i,meta.welds[n],[.58,.81,1],4));
    const canvas=makeCanvas(meta.width,meta.height),ctx=canvas.getContext('2d');let gpuRenderer=null;
    try{if(!forceCanvas)gpuRenderer=gpu(photo,normal,material,sectors,meta);}catch(error){console.warn('Station uses Canvas lighting fallback:',error);}
    const mixCanvas=makeCanvas(meta.width,meta.height),mixCtx=mixCanvas.getContext('2d');
    const regionCanvas=makeCanvas(meta.width,meta.height),regionCtx=regionCanvas.getContext('2d');
    const coloredPhoto=makeCanvas(meta.width,meta.height),coloredCtx=coloredPhoto.getContext('2d');
    let previous='',backend=gpuRenderer?'webgl':'canvas';
    const renderer={canvas,welds,get backend(){return backend;},render(s){
      const signature=JSON.stringify([s.direction,s.darkness,s.key,s.keyColor,s.sectorWeights]);if(signature===previous)return false;previous=signature;
      let angle=(Math.atan2(s.direction[1],s.direction[0])/(Math.PI*2)+1)%1*12;const a=Math.floor(angle),b=(a+1)%12,f=angle-a;
      if(gpuRenderer?.render(s,a,b,f)){ctx.globalCompositeOperation='copy';ctx.drawImage(gpuRenderer.canvas,0,0);ctx.globalCompositeOperation='source-over';return true;}
      backend='canvas';
      ctx.globalCompositeOperation='copy';ctx.drawImage(photo,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=s.darkness;ctx.drawImage(dark,0,0);ctx.globalAlpha=1;
      mixCtx.clearRect(0,0,canvas.width,canvas.height);mixCtx.globalCompositeOperation='lighter';mixCtx.globalAlpha=1-f;mixCtx.drawImage(layers[a],0,0);mixCtx.globalAlpha=f;mixCtx.drawImage(layers[b],0,0);mixCtx.globalAlpha=1;
      const maximum=Math.max(.001,...s.sectorWeights);regionCtx.clearRect(0,0,canvas.width,canvas.height);regionCtx.globalCompositeOperation='lighter';sectors.forEach((img,i)=>{regionCtx.globalAlpha=s.sectorWeights[i]/maximum;regionCtx.drawImage(img,0,0);});regionCtx.globalAlpha=1;
      mixCtx.globalCompositeOperation='destination-in';mixCtx.drawImage(regionCanvas,0,0);mixCtx.globalCompositeOperation='source-in';coloredCtx.globalCompositeOperation='copy';coloredCtx.drawImage(photo,0,0);coloredCtx.globalCompositeOperation='multiply';coloredCtx.fillStyle=`rgb(${s.keyColor.join(',')})`;coloredCtx.fillRect(0,0,canvas.width,canvas.height);coloredCtx.globalCompositeOperation='source-over';mixCtx.drawImage(coloredPhoto,0,0);mixCtx.globalCompositeOperation='source-over';
      ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.min(1,s.key*maximum);ctx.drawImage(mixCanvas,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';

      return true;
    }};return renderer;
  };
})();
