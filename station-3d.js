import * as THREE from './vendor/three/three.module.js';
import {buildStation} from './station-3d-structure.js';
import {buildHangar} from './station-3d-hangar.js';
import {createPost} from './station-3d-post.js';
const $=id=>document.getElementById(id),canvas=$('space');
const MODES={shift:{key:3.9,fill:.65,ambient:.21,exposure:1.03,color:0xffe2bc},night:{key:1.35,fill:.65,ambient:.10,exposure:1.04,color:0xa6c9ff},service:{key:3.1,fill:.8,ambient:.17,exposure:1.04,color:0xdcecff}};
let paused=false,activity=1,mode='shift',modeElapsed=4,elapsed=0,activityTime=0,last=0,lastPaint=0,frame=0,ready=false,disposed=false,hasReceivedSettings=false;
let current={...MODES.shift,color:new THREE.Color(MODES.shift.color)},from={...current,color:current.color.clone()},target={...current,color:current.color.clone()};
let renderer,post,scene,camera,station,hangar,key,fill,ambient,inspection,environment;
const rng=(()=>{let s=84621;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};})();
function setMode(id,immediate=paused){if(!MODES[id]||id===mode)return;mode=id;from={...current,color:current.color.clone()};target={...MODES[id],color:new THREE.Color(MODES[id].color)};modeElapsed=immediate?4:0;if(immediate)current={...target,color:target.color.clone()};for(const b of $('modes').children)b.setAttribute('aria-pressed',String(b.dataset.mode===id));if(ready)paint();}
function settings(s,initial=false){const nextPaused=Boolean(s.paused);activity=THREE.MathUtils.clamp(Number(s.weather)||0,0,1);if(s.stationMode)setMode(s.stationMode,initial||nextPaused);paused=nextPaused;$('activity').value=activity*100;$('play').textContent=paused?'Продолжить':'Пауза';if(ready)sync();}
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='nightfall:settings')return;settings(e.data,!hasReceivedSettings);hasReceivedSettings=true;});
function createSky(){
 const sky=new THREE.Mesh(new THREE.SphereGeometry(320,32,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 p;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 void main(){vec3 d=normalize(p);float band=exp(-pow((d.y+d.x*.6+.1)*4.2,2.));float n=noise(d*7.)*.5+noise(d*17.)*.3+noise(d*39.)*.13;float cloud=pow(max(0.,n-.22),2.)*band;vec3 c=vec3(.0006,.0011,.0025)+vec3(.065,.085,.18)*cloud;gl_FragColor=vec4(c,1.);}` }));scene.add(sky);
 const count=5700,positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
 for(let i=0;i<count;i++){const z=rng()*2-1,a=rng()*Math.PI*2,r=Math.sqrt(1-z*z),v=.12+Math.pow(rng(),7)*1.2;positions.set([r*Math.cos(a)*290,z*290,r*Math.sin(a)*290],i*3);const tint=rng();colors.set([v*(.72+tint*.28),v*(.82+tint*.18),v],i*3);sizes[i]=.65+Math.pow(rng(),8)*2;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('size',new THREE.BufferAttribute(sizes,1));
 const stars=new THREE.Points(g,new THREE.ShaderMaterial({depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,vertexColors:true,uniforms:{pixelRatio:{value:Math.min(devicePixelRatio,1.5)}},vertexShader:'attribute float size;uniform float pixelRatio;varying vec3 c;void main(){c=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=size*pixelRatio;}',fragmentShader:'varying vec3 c;void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*3.);gl_FragColor=vec4(c,a);}' }));scene.add(stars);
}
function createEnvironment(){
 const env=new THREE.Scene();env.background=new THREE.Color(.035,.045,.06);
 const panel=(color,intensity,x,y,z,sx,sy)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);env.add(m);};
 panel(0xe2efff,3,-12,18,12,22,10);panel(0x5381b3,.7,15,5,-16,9,16);panel(0xb7824b,.28,0,-9,5,14,5);
 const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromScene(env,.025);scene.environment=environment.texture;scene.environmentIntensity=.55;pmrem.dispose();env.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
function fit(){if(!renderer)return;const w=innerWidth,h=innerHeight,aspect=w/h;renderer.setSize(w,h,false);camera.aspect=aspect;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(36)/2)*Math.max(1,1.40/aspect)));camera.updateProjectionMatrix();post.resize(Math.round(w*renderer.getPixelRatio()),Math.round(h*renderer.getPixelRatio()));if(ready)paint();}
function lightStep(dt){modeElapsed=Math.min(4,modeElapsed+dt);const s=modeElapsed/4,k=s*s*(3-2*s);for(const prop of ['key','fill','ambient','exposure'])current[prop]=THREE.MathUtils.lerp(from[prop],target[prop],k);current.color.copy(from.color).lerp(target.color,k);}
function paint(){if(!ready||disposed)return;
 key.intensity=current.key;key.color.copy(current.color);fill.intensity=current.fill;ambient.intensity=current.ambient;
 station.update(elapsed,1);hangar.update(elapsed,activity,mode);
 inspection.intensity=mode==='service'?28:mode==='night'?3:10;
 inspection.target.position.set(Math.sin(activityTime*.19)*9,-.3,Math.cos(activityTime*.19)*8);
 const metrics=post.render(scene,camera,current.exposure);
 canvas.dataset.time=elapsed.toFixed(4);canvas.dataset.activityTime=activityTime.toFixed(4);canvas.dataset.mode=mode;canvas.dataset.transition=(modeElapsed/4).toFixed(4);canvas.dataset.camera='fixed';canvas.dataset.triangles=String(metrics.triangles);canvas.dataset.status='ready';canvas.dataset.drawCalls=String(metrics.calls);canvas.dataset.frameMs=metrics.ms.toFixed(2);
}
function tick(now){if(disposed)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;elapsed+=dt;activityTime+=dt*activity;lightStep(dt);if(now-lastPaint>=1000/30){paint();lastPaint=now;}frame=requestAnimationFrame(tick);}
function sync(){cancelAnimationFrame(frame);last=0;if(!ready)return;if(!paused&&!document.hidden)frame=requestAnimationFrame(tick);else paint();}
function toggle(){paused=!paused;$('play').textContent=paused?'Продолжить':'Пауза';sync();}
async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}}
$('play').addEventListener('click',toggle);$('activity').addEventListener('input',()=>{activity=Number($('activity').value)/100;paint();});$('full').addEventListener('click',full);for(const b of $('modes').children)b.addEventListener('click',()=>setMode(b.dataset.mode));
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();toggle();}if(e.key.toLowerCase()==='h')document.documentElement.classList.toggle('hide-controls');if(e.key.toLowerCase()==='f')full();});
window.addEventListener('resize',fit);document.addEventListener('visibilitychange',sync);
window.addEventListener('pageshow',e=>{if(e.persisted)sync();});
window.addEventListener('pagehide',e=>{if(e.persisted){cancelAnimationFrame(frame);last=0;return;}disposed=true;cancelAnimationFrame(frame);post?.dispose();environment?.dispose();scene?.traverse(o=>{o.geometry?.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)if(m){for(const key of ['map','bumpMap','normalMap','roughnessMap'])m[key]?.dispose();m.dispose();}});renderer?.dispose();});
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.1,600);camera.position.set(31,24,39);camera.lookAt(0,0,0);
 createSky();createEnvironment();
 station=buildStation(THREE);scene.add(station.group);hangar=buildHangar(THREE);hangar.group.position.set(0,0,13);scene.add(hangar.group);
 key=new THREE.DirectionalLight(0xffe2bc,3.9);key.position.set(-26,36,20);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:110});key.shadow.bias=-.00018;key.shadow.normalBias=.035;scene.add(key);
 fill=new THREE.DirectionalLight(0x7393c2,.65);fill.position.set(18,10,-25);scene.add(fill);ambient=new THREE.HemisphereLight(0xa7c3e5,0x1e2028,.21);scene.add(ambient);
 inspection=new THREE.SpotLight(0xb7deff,10,55,.36,.75,1.8);inspection.position.set(2,12,-4);scene.add(inspection,inspection.target);
 post=createPost(THREE,renderer);if(window.stationInitialSettings){settings(window.stationInitialSettings,true);hasReceivedSettings=true;}ready=true;fit();paint();$('loading').hidden=true;document.documentElement.dataset.renderer='threejs-webgl2';sync();parent.postMessage({type:'nightfall:scene-ready',scene:'station'},location.origin);
}catch(error){console.error(error);$('loading').hidden=true;$('error').textContent='Не удалось запустить 3D-сцену. Нужен браузер с WebGL 2 и аппаратным ускорением. '+error.message;$('error').hidden=false;canvas.dataset.status='error';}
