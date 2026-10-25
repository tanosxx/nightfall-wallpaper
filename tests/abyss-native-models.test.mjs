import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
for(const name of ['lighting','practicals','water','elevator','interior','transit']){
 const source=fs.readFileSync(new URL(`abyss-${name}.js`,root),'utf8');
 const context={window:{}};vm.runInNewContext(source,context);
 const browser=context.window['ABYSS_'+name.toUpperCase()];
 const {Model:native}=await import(new URL(`extension/nightfall@local/abyss-${name}-model.js`,root));
 for(const t of [0,.17,1,4.3,5,12,30,61,183,740]){
  if(name==='water'){
   for(const i of [0,100,154,195])assert.deepEqual(JSON.parse(JSON.stringify(browser.particleAt(i,t))),native.particleAt(i,t));
   for(const i of [0,15,38])assert.deepEqual(JSON.parse(JSON.stringify(browser.bubbleAt(i,t))),native.bubbleAt(i,t));
  }else assert.deepEqual(JSON.parse(JSON.stringify(browser.sample(t))),JSON.parse(JSON.stringify(native.sample(t))));
 }
}
console.log('Abyss native/browser exact deterministic model parity PASS');
