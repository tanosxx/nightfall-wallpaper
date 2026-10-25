import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
import * as data from '../station-data.js';
const root=path.resolve(decodeURIComponent(new URL('../',import.meta.url).pathname)),out=path.join(root,'extension/nightfall@local');
const industrial=fs.readFileSync(root+'/station-industrial.js','utf8');
let pure=industrial.slice(industrial.indexOf("'use strict';")+13,industrial.indexOf('  window.createStationIndustrial'));
pure=pure.slice(0,pure.indexOf('  function puffTexture'))+pure.slice(pure.indexOf('  function steamSamples'));
let body=industrial.slice(industrial.indexOf('    return {',industrial.indexOf('  window.createStationIndustrial')),industrial.indexOf('  // Pure sampling helpers'));
body=body.replace(/\n  };\n$/,'\n}\n');
fs.writeFileSync(out+'/station-industrial-native.js','// Exact approved mechanical geometry and timing from station-industrial.js.\n'+pure+'\nexport const Model={vents,strips,steamSamples,carriagePosition};\nexport function createStationIndustrial(sprites){\n'+body);
const space=fs.readFileSync(root+'/station-space.js','utf8');
const context={window:{}};vm.runInNewContext(industrial,context);vm.runInNewContext(space,context);
const json={hull:data.HULL_MASK,beacons:data.BEACONS,workLights:data.HANGAR.workLights,extraForeground:context.window.STATION_SPACE.extraForeground};
fs.writeFileSync('/tmp/station-native-data.json',JSON.stringify(json));
const spacePure=space.slice(space.indexOf("'use strict';")+13,space.indexOf('  const makeCanvas'))
 +space.slice(space.indexOf('  const particles='),space.indexOf('  function noise'));
fs.writeFileSync(out+'/station-space-model.js','// Same background dust trajectories as the approved browser scene.\n'+spacePure+'\nexport const Model={sample,particles};\n');
const target=root+'/assets/station-native';fs.mkdirSync(target,{recursive:true});
// Execute only existing procedural texture builders, with a tiny image-data sink.
const textures=[];
const document={createElement(){return {width:0,height:0,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(image){textures.push(image);}};}};}};
const c={window:{},document};vm.runInNewContext(industrial,c);c.window.createStationIndustrial();
const noisePart=space.slice(space.indexOf('  function noise'),space.indexOf('  window.createStationSpace'));
vm.runInNewContext("const fract=x=>x-Math.floor(x),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},hash=x=>fract(Math.sin(x*127.1+311.7)*43758.5453),makeCanvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});\n"+noisePart+'\nnebulaTexture();',c);
textures.forEach((image,i)=>fs.writeFileSync(`${target}/${i<8?'puff-'+i:'nebula'}.rgba`,image.data));
console.log('Extracted exact station models and 9 procedural RGBA textures.');
