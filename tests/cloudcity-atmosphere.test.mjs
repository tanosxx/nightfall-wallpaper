import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../cloudcity-atmosphere.js',import.meta.url),'utf8'),sandbox);
const {flowAt,cloudCoverageAt,stormAt,stormEvents,buildings,rails,foregroundShapes}=sandbox.window.CLOUDCITY_ATMOSPHERE;
for(const y of [350,500,700,820]){
  let last=flowAt(900,y,0);
  for(let t=.5;t<130;t+=.5){const p=flowAt(900,y,t);assert.ok(p.x>last.x,'Clouds must never reverse the wind direction');last=p;}
}
for(const time of [0,4,180,600,1200,3600]){
  const reference=flowAt(900,350,time);
  for(const y of [350,500,600,700,820]){
    const p=flowAt(900,y,time);
    assert.equal(p.speed,.85,'Photographic clouds travel coherently at a single speed');
    assert.equal(p.x,900+time*.85,'Photographic detail must not accumulate nonlinear horizontal distortion');
    assert.equal(p.x,reference.x,'A cloud keeps the same horizontal displacement at every height, even after an hour');
    assert.equal(p.y,y,'Cloud motion must not stretch or translate photographic detail vertically');
  }
}
for(const [x,y] of [[172,560],[330,685],[494,741],[550,780],[650,470]]){
  assert.equal(cloudCoverageAt(x,y),0,`Lower-left original cloud photograph ${x},${y} must stay static`);
}
assert.ok(cloudCoverageAt(900,600)>0,'Central cloud ocean remains animated');
let previous=cloudCoverageAt(650,600);
for(let x=651;x<=850;x++){
  const coverage=cloudCoverageAt(x,600);
  assert.ok(coverage>=previous&&coverage>=0&&coverage<=1,'Lower-left exclusion feathers monotonically into central clouds');
  assert.ok(coverage-previous<.02,'Cloud coverage must not produce a hard vertical edge');
  previous=coverage;
}
previous=cloudCoverageAt(400,420);
for(let y=421;y<=470;y++){
  const coverage=cloudCoverageAt(400,y);
  assert.ok(coverage<=previous&&coverage>=0&&coverage<=1,'Lower-left exclusion feathers monotonically downwards');
  assert.ok(previous-coverage<.05,'Cloud coverage must not produce a hard horizontal edge');
  previous=coverage;
}
assert.equal(stormAt(0).power,0);assert.equal(stormAt(12).power,0);
for(const e of stormEvents){assert.ok(stormAt(e.at+.08).power>.4);assert.equal(stormAt(e.at+e.duration+.01).power,0);assert.ok(stormAt(e.at+.29).power>.2);}
assert.deepEqual(stormAt(6.48),stormAt(119.48),'Storm schedule loops deterministically');
assert.ok(buildings.length>=8&&rails.length>=6,'Architecture and balcony have explicit occlusion geometry');
function inside(x,y,p){
  let found=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])found=!found;
  return found;
}
for(const [x,y] of [[610,730],[620,757],[545,739],[480,650],[42,620],[118,580]]){
  assert.ok(buildings.some(p=>inside(x,y,p)),`Visible left facade ${x},${y} must remain fixed, including through the mist`);
}
for(const [x,y] of [[658,730],[494,741],[510,766]]){
  assert.ok(!buildings.some(p=>inside(x,y,p)),`Open cloud ${x},${y} must not be frozen by a rectangular facade mask`);
}
function onRail(x,y,[a,b,width]){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<=(width+2)/2;
}
const foregroundProtected=(x,y)=>foregroundShapes.some(p=>inside(x,y,p))||rails.some(r=>onRail(x,y,r));
for(const [x,y] of [[263,710],[443,740],[830,780],[1280,815],
  [425,765],[808,809],[1255,865],[176,660],[590,690],[1386,754],
  [350,666],[1000,717],[350,702],[1100,772],[400,775],[1000,848],
  [400,835],[1200,910],[1525,730]]){
  assert.ok(foregroundProtected(x,y),`Visible post, bracket, lamp or bar ${x},${y} must stay outside moving mist`);
}
for(const [x,y] of [[350,720],[700,760],[1000,790],[1200,830]]){
  assert.ok(!foregroundProtected(x,y)&&!buildings.some(p=>inside(x,y,p)),`Cloud opening ${x},${y} between railings must stay open`);
}
console.log('PASS: coherent cloud translation without accumulated shear, fixed lower-left photograph, smooth exclusion, storm pulses and architectural protection');
