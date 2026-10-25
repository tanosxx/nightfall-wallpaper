/* Small local HDR bloom pipeline. Geometry, shadows and light are rendered
 * in linear space before the final exposure and sRGB conversion. */
export function createPost(THREE,renderer){
 const options={type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false};
 const base=new THREE.WebGLRenderTarget(1,1,options),a=new THREE.WebGLRenderTarget(1,1,{...options,depthBuffer:false}),b=a.clone();
 base.samples=Math.min(4,renderer.capabilities.maxSamples);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));scene.add(quad);
 const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{inputTexture:{value:null},stepSize:{value:new THREE.Vector2()},extract:{value:1}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D inputTexture;uniform vec2 stepSize;uniform float extract;
 vec3 sampleLight(vec2 uv){vec3 c=texture2D(inputTexture,uv).rgb;float peak=max(c.r,max(c.g,c.b));return c*mix(1.,smoothstep(.85,1.7,peak),extract);}
 void main(){vec3 c=sampleLight(vUv)*.227027;c+=sampleLight(vUv+stepSize*1.384615)*.316216;c+=sampleLight(vUv-stepSize*1.384615)*.316216;c+=sampleLight(vUv+stepSize*3.230769)*.070270;c+=sampleLight(vUv-stepSize*3.230769)*.070270;gl_FragColor=vec4(c,1.);}`});
 const finish=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{baseTexture:{value:base.texture},bloomTexture:{value:b.texture},exposure:{value:1}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D baseTexture,bloomTexture;uniform float exposure;
 vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 vec3 toSRGB(vec3 x){return mix(x*12.92,1.055*pow(max(x,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),x));}
 void main(){vec3 c=texture2D(baseTexture,vUv).rgb+texture2D(bloomTexture,vUv).rgb*.22;c=toSRGB(aces(c*exposure));float edge=dot(vUv-.5,vUv-.5);c*=1.-edge*.19;gl_FragColor=vec4(c,1.);}`});
 let width=1,height=1;
 return {resize(w,h){width=w;height=h;base.setSize(w,h);a.setSize(Math.max(1,w>>1),Math.max(1,h>>1));b.setSize(Math.max(1,w>>1),Math.max(1,h>>1));},render(world,view,exposure=1){const start=performance.now();renderer.setRenderTarget(base);renderer.clear();renderer.render(world,view);const metrics={...renderer.info.render};quad.material=blur;blur.uniforms.inputTexture.value=base.texture;blur.uniforms.stepSize.value.set(2/width,0);blur.uniforms.extract.value=1;renderer.setRenderTarget(a);renderer.render(scene,camera);blur.uniforms.inputTexture.value=a.texture;blur.uniforms.stepSize.value.set(0,2/height);blur.uniforms.extract.value=0;renderer.setRenderTarget(b);renderer.render(scene,camera);quad.material=finish;finish.uniforms.exposure.value=exposure;renderer.setRenderTarget(null);renderer.render(scene,camera);metrics.ms=performance.now()-start;return metrics;},dispose(){base.dispose();a.dispose();b.dispose();blur.dispose();finish.dispose();quad.geometry.dispose();}};
}
