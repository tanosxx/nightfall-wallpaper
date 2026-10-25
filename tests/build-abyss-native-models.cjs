const fs=require('fs'),vm=require('vm');
const root=process.cwd(),out=root+'/extension/nightfall@local/';
const modelExports={lighting:'{windows:WINDOWS,beacons:BEACONS,worklamps:WORKLAMPS,windowSchedules:schedules,lampEvent,sample}',practicals:'{lamps,sample,eventFor}',water:'{W,H,grains,waterRegions,particleAt,bubbleAt}',elevator:'{sample,glass,bars,cycle,stages}',interior:'{sample,routines:ROUTINES,bounds:BOUNDS,panes:PANES,furniture:FURNITURE,monitors:MONITORS}',transit:'{sample,bridges:BRIDGES,floorAt}'};
const cuts={lighting:'    window.ABYSS_LIGHTING',practicals:'    window.ABYSS_PRACTICALS',water:'  window.ABYSS_WATER',elevator:'  window.ABYSS_ELEVATOR',interior:'    function makeCanvas',transit:'    function canvas'};
const data={};
for(const name of Object.keys(modelExports)){
 const source=fs.readFileSync(root+'/abyss-'+name+'.js','utf8');
 let pure=source.slice(source.indexOf("'use strict';")+13,source.indexOf(cuts[name]));
 let tail='';
 if(name==='interior'||name==='transit'){
  const begin=source.indexOf('    function limb('),end=source.indexOf('    function createAbyss'+(name==='interior'?'Interior':'Transit'));
  tail=source.slice(begin,end).replace('    function person(', 'export function drawPerson(');
 }
 fs.writeFileSync(out+'abyss-'+name+'-model.js','// Native model: identical schedules and geometry from abyss-'+name+'.js.\n'+pure+'\nexport const Model = '+modelExports[name]+';\n'+tail);
 const context={window:{}};vm.runInNewContext(source,context);data[name]=JSON.parse(JSON.stringify(context.window['ABYSS_'+name.toUpperCase()]));
}
fs.writeFileSync('/tmp/abyss-native-data.json',JSON.stringify(data));
