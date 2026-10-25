import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const calls=[];
let releaseAtmosphere;
const atmosphereReady=new Promise(resolve=>{releaseAtmosphere=resolve;});
const photo={kind:'photo'};
const scope={URL,Promise,document:{currentScript:{src:'http://127.0.0.1:8847/junction-renderer.js'}},
  Image:class {set src(value){this.url=value;queueMicrotask(()=>this.onload());}},
  window:{
    createJunctionAtmosphere:()=>({ready:atmosphereReady,renderBase:()=>calls.push('clean'),render:()=>calls.push('weather')}),
    createJunctionLights:()=>({render:()=>calls.push('windows')}),
    createJunctionTraffic:()=>({render:()=>calls.push('traffic')}),
    createJunctionBeacons:()=>({render:()=>calls.push('beacons')}),
    JUNCTION_BEACONS:{power:()=>1},
  }};
vm.createContext(scope);
for(const name of ['junction-data.js','junction-motion.js','junction-renderer.js'])
  vm.runInContext(await readFile(new URL(`../${name}`,import.meta.url),'utf8'),scope);
const ctx=new Proxy({drawImage(image){calls.push(image===photo?'photo':`stock:${image.url}`);},
  createRadialGradient:()=>({addColorStop(){}})},
  {get:(target,key)=>key in target?target[key]:()=>{}});
const scene=scope.window.createJunctionScene(photo);
let ready=false;scene.ready.then(()=>{ready=true;});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(ready,false,'The scene must await its smoke-free plate as well as its train sprites');
releaseAtmosphere();await scene.ready;
scene.render(ctx,12,.6);
assert(!calls.some(c=>c.startsWith('stock:')),'No foreground train is rendered during its previous passage');
assert(calls.indexOf('photo')<calls.indexOf('clean'));
assert(calls.indexOf('clean')<calls.indexOf('windows'),'Window activity survives the smoke clean-up');
assert(calls.indexOf('windows')<calls.indexOf('traffic'));
assert.equal(calls.at(-1),'weather');
calls.length=0;scene.render(ctx,39,.6);
assert(calls.some(c=>c.startsWith('stock:')),'The distant train still passes');
assert.equal(calls.filter(c=>c==='photo').length,1,'Train occlusion must not paste the static photo back over active city lights');
assert(calls.indexOf('traffic')<calls.findIndex(c=>c.startsWith('stock:')),'Traffic remains behind the viaduct train');
assert.equal(calls.at(-1),'weather');
console.log('PASS: no foreground train, distant train retained, clean plate awaited, city layers survive composition.');
