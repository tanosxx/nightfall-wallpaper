/* Sky scrolls continuously. Original smoke and water use overlapping
 * advective phases, feathered into the photograph at their boundaries. */
(() => {
  'use strict';
  window.createNightfallPhotoFlow = (canvas, picture, data) => {
    const W=data.IMAGE_WIDTH,H=data.IMAGE_HEIGHT;
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});
    if(!gl)throw new Error('Для движения фотографии нужен WebGL.');
    function clearance(polygons){
      const c=document.createElement('canvas');c.width=W;c.height=H;
      const p=c.getContext('2d',{willReadFrequently:true});p.fillStyle='white';
      for(const polygon of polygons){p.beginPath();polygon.forEach(([x,y],i)=>i?p.lineTo(x*W,y*H):p.moveTo(x*W,y*H));p.closePath();p.fill();}
      const a=p.getImageData(0,0,W,H).data,d=new Float32Array(W*H);
      for(let i=0;i<d.length;i++)d[i]=a[i*4+3]>128?10000:0;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x;if(!d[i])continue;
        d[i]=Math.min(d[i],x?d[i-1]+1:0,y?d[i-W]+1:0,x&&y?d[i-W-1]+1.414:10000,x<W-1&&y?d[i-W+1]+1.414:10000);
      }
      for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){
        const i=y*W+x;if(!d[i])continue;
        d[i]=Math.min(d[i],x<W-1?d[i+1]+1:0,y<H-1?d[i+W]+1:0,x<W-1&&y<H-1?d[i+W+1]+1.414:10000,x&&y<H-1?d[i+W-1]+1.414:10000);
      }
      return d;
    }
    const sky=clearance([data.SKY_POLYGON]),smoke=clearance((data.PHOTO_SMOKE||[]).map(r=>r.polygon)),water=clearance((data.RIVER||[]).map(r=>r.polygon));
    const field=document.createElement('canvas');field.width=W;field.height=H;
    const fc=field.getContext('2d'),pixels=fc.createImageData(W,H);
    for(let i=0;i<sky.length;i++){
      pixels.data[i*4]=Math.min(255,sky[i]/40*255);
      pixels.data[i*4+1]=Math.min(255,smoke[i]/24*255);
      pixels.data[i*4+2]=Math.min(255,water[i]/12*255);
      pixels.data[i*4+3]=255;
    }
    fc.putImageData(pixels,0,0);
    // A building-free strip of the photographed clouds becomes a seamless
    // mirrored panorama. Its texture scrolls steadily; there is no return path.
    const skyTile=document.createElement('canvas');skyTile.width=2800;skyTile.height=360;
    const sc=skyTile.getContext('2d');
    sc.drawImage(picture,440,0,700,180,0,0,1400,360);
    sc.save();sc.translate(2800,0);sc.scale(-1,1);sc.drawImage(picture,440,0,700,180,0,0,1400,360);sc.restore();
    // Match the cloud strip to the original atmosphere at each height.
    const tilePixels=sc.getImageData(0,0,2800,360);
    for(let y=0;y<360;y++){
      const row=data.SKY_COLOR_ROWS[y],target=row.target,avg=row.source;
      const contrast=Math.min(.85,...target.map((v,c)=>v/Math.max(1,avg[c])));
      for(let x=0;x<2800;x++)for(let c=0;c<3;c++){
        const i=(y*2800+x)*4+c;
        tilePixels.data[i]=Math.max(0,Math.min(255,target[c]+(tilePixels.data[i]-avg[c])*contrast));
      }
    }
    sc.putImageData(tilePixels,0,0);
    const vertex='attribute vec2 position; varying vec2 screen; void main(){screen=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}';
    const fragment=`precision highp float;
      uniform sampler2D photo,field,clouds; uniform vec2 viewport,size; uniform float time,activity;
      varying vec2 screen;
      vec4 advect(vec2 uv,vec2 flow,float period,float phase){
        float p=fract(time/period+phase),q=fract(p+0.5);
        float a=sin(p*3.14159265);a*=a;
        return mix(texture2D(photo,uv-flow*(q-0.5)/size),texture2D(photo,uv-flow*(p-0.5)/size),a);
      }
      void main(){
        float scale=max(viewport.x/size.x,viewport.y/size.y);
        vec2 uv=(screen*viewport-(viewport-size*scale)*0.5)/(size*scale);
        vec3 mask=texture2D(field,uv).rgb;
        vec4 color=texture2D(photo,uv);
        if(mask.r>0.001){
          vec2 skyUV=vec2(fract((uv.x*size.x+time*5.0)/2800.0),clamp(1.0-(1.0-uv.y)*size.y/360.0,0.0,1.0));
          color=mix(color,texture2D(clouds,skyUV),mask.r*activity);
        }
        if(mask.g>0.001)color=mix(color,advect(uv,vec2(-7.0,38.0)*mask.g,7.0,0.31),activity);
        if(mask.b>0.001){
          vec2 rippled=uv+vec2(sin(uv.y*size.y*0.18+time*2.2)*1.5,0.0)*mask.b/size;
          color=mix(color,advect(rippled,vec2(5.0,-15.0)*mask.b,6.0,0.43),activity);
        }
        gl_FragColor=color;
      }`;
    function shader(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    function texture(source,index,name){gl.activeTexture(gl.TEXTURE0+index);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,name),index);}
    texture(picture,0,'photo');texture(field,1,'field');texture(skyTile,2,'clouds');
    const uniforms=Object.fromEntries(['viewport','size','time','activity'].map(x=>[x,gl.getUniformLocation(program,x)]));
    gl.uniform2f(uniforms.size,W,H);canvas.dataset.renderer='photo-flow-v4';
    return {paint(time,activity,width,height,ratio){
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      gl.uniform2f(uniforms.viewport,width,height);gl.uniform1f(uniforms.time,time);gl.uniform1f(uniforms.activity,activity);gl.drawArrays(gl.TRIANGLES,0,6);
    }};
  };
})();
