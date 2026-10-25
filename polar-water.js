/* Only the photographed water moves. A distance field keeps shorelines fixed. */
(() => {
  'use strict';
  window.createPolarWater = (canvas, picture, data) => {
    const W=data.IMAGE_WIDTH,H=data.IMAGE_HEIGHT;
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
    if(!gl)throw new Error('Для движения воды нужен WebGL.');
    const mask=document.createElement('canvas');mask.width=W;mask.height=H;
    const p=mask.getContext('2d',{willReadFrequently:true});
    for(const region of data.WATER_SURFACE||[]){
      p.fillStyle=`rgb(255,${Math.round(Math.min(3,region.amplitude??1)/3*255)},${Math.round((region.phase??0)/10*255)})`;p.beginPath();region.polygon.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();p.fill();
    }
    const pixels=p.getImageData(0,0,W,H),d=new Float32Array(W*H);
    for(let i=0;i<d.length;i++)d[i]=pixels.data[i*4+3]>128?10000:0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;if(!d[i])continue;
      d[i]=Math.min(d[i],x?d[i-1]+1:0,y?d[i-W]+1:0,x&&y?d[i-W-1]+1.414:10000,x<W-1&&y?d[i-W+1]+1.414:10000);
    }
    for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){
      const i=y*W+x;if(!d[i])continue;
      d[i]=Math.min(d[i],x<W-1?d[i+1]+1:0,y<H-1?d[i+W]+1:0,x<W-1&&y<H-1?d[i+W+1]+1.414:10000,x&&y<H-1?d[i+W-1]+1.414:10000);
    }
    const feather=Math.max(12,...(data.WATER_SURFACE||[]).map(r=>r.feather||12));
    for(let i=0;i<d.length;i++){
      const f=Math.min(1,d[i]/feather),v=Math.round(f*f*(3-2*f)*255);
      pixels.data[i*4]=v;pixels.data[i*4+3]=255;
    }
    p.putImageData(pixels,0,0);
    const vertex='attribute vec2 position; varying vec2 screen; void main(){screen=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}';
    const fragment=`precision highp float;
      uniform sampler2D photo,mask; uniform vec2 viewport,size; uniform float time,activity;
      varying vec2 screen;
      void main(){
        float scale=max(viewport.x/size.x,viewport.y/size.y);
        vec2 uv=(screen*viewport-(viewport-size*scale)*0.5)/(size*scale);
        vec2 p=vec2(uv.x*size.x,(1.0-uv.y)*size.y);
        vec3 field=texture2D(mask,uv).rgb;
        float m=field.r*activity, t=time+field.b*10.0, amplitude=field.g*3.0;
        float depth=clamp((p.y-440.0)/460.0,0.0,1.0);
        float dx=(sin(p.y*.16+t*1.25)+.4*sin(p.y*.073-t*.83+p.x*.007))*(.3+depth*1.5);
        float dy=(sin(p.x*.025+t*.71)+.4*sin(p.y*.09+t*.52))*(.12+depth*.45);
        gl_FragColor=texture2D(photo,uv+vec2(dx,-dy)*m*amplitude/size);
      }`;
    const shaders=[];
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));shaders.push(s);return s;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const textures=[];
    function texture(source,index,name){gl.activeTexture(gl.TEXTURE0+index);const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,name),index);}
    texture(picture,0,'photo');texture(mask,1,'mask');
    const u=Object.fromEntries(['viewport','size','time','activity'].map(x=>[x,gl.getUniformLocation(program,x)]));gl.uniform2f(u.size,W,H);
    canvas.dataset.renderer='polar-water-v6';
    return {paint(time,activity,width,height,ratio){
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);gl.uniform2f(u.viewport,width,height);gl.uniform1f(u.time,time);gl.uniform1f(u.activity,activity);gl.drawArrays(gl.TRIANGLES,0,6);
    },destroy(){for(const t of textures)gl.deleteTexture(t);for(const s of shaders)gl.deleteShader(s);gl.deleteBuffer(buffer);gl.deleteProgram(program);}};
  };
})();
