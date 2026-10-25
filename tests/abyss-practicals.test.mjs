import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../abyss-practicals.js',import.meta.url),'utf8'),context);
const {lamps,sample,eventFor} = context.window.ABYSS_PRACTICALS;
assert(lamps.length >= 20 && lamps.length <= 35);
assert.equal(new Set(lamps.map(lamp => lamp.id)).size,lamps.length);
const surfaceLamps = lamps.filter(lamp=>lamp.beam);
assert.equal(surfaceLamps.length,4,'the four measured large warm wall/deck pools need surface metadata');
for(const lamp of surfaceLamps) {
    const beam=lamp.beam;
    assert.equal(beam.axis[0][0],lamp.x);
    assert.equal(beam.axis[0][1],lamp.y);
    assert.equal(beam.axis.at(-1)[0],beam.endX);
    assert.equal(beam.axis.at(-1)[1],beam.endY);
    assert(beam.endY>lamp.y && beam.width>0);
    assert(beam.points.length>=4);
    assert(beam.points.every(([x,y])=>x>=0 && x<1672 && y>=0 && y<941));
}
assert(sample(0).every(value => value === 1));
const fixed = JSON.stringify(sample(93.125));
sample(1e7); sample(0);
assert.equal(JSON.stringify(sample(93.125)),fixed,'pausing, rewinding and long sessions must keep the same light state');

const minima = lamps.map(() => 1),maxima = lamps.map(() => 0);
for(let t=0;t<180;t+=.05) {
    sample(t).forEach((power,index) => {
        assert(Number.isFinite(power) && power >= 0 && power <= 1);
        minima[index] = Math.min(minima[index],power);
        maxima[index] = Math.max(maxima[index],power);
    });
}
assert(minima.every(power => power < .2),'all measured lamps must visibly change');
assert(maxima.every(power => power === 1),'all lamps must recover to normal');
const visibleEarly = Array.from({length:150},(_,step)=>sample(step*.02))
    .some(state=>lamps.some((lamp,i)=>lamp.x>800 && lamp.x<1250 && state[i]<.2));
assert(visibleEarly,
    'an amber light in the ordinary central crop must visibly flutter before three seconds');

let flutterCount=0,switchCount=0;
for(let i=0;i<lamps.length;i++) {
    const lamp=lamps[i];
    assert(lamp.x>=0 && lamp.x<1672 && lamp.y>=0 && lamp.y<941);
    assert(!(lamp.x>838 && lamp.x<1266 && lamp.y>250 && lamp.y<339),'exclude main observatory glazing');
    assert(!(lamp.x>628 && lamp.x<644 && lamp.y>466 && lamp.y<794),'exclude lift shaft');
    for(let cycle=0;cycle<4;cycle++) {
        const event=eventFor(i,cycle);
        assert.equal(sample(event.start)[i],1);
        assert(Math.abs(sample(event.start+event.duration)[i]-1)<1e-10);
        let dark=false,dips=0,recoveries=0;
        for(let k=0;k<=500;k++) {
            const power=sample(event.start+event.duration*k/500)[i];
            if(!dark && power<.2){dark=true;dips++;}
            if(dark && power>.98){dark=false;recoveries++;}
        }
        assert.equal(dips,lamp.behaviour==='flutter'?3:1);
        assert.equal(recoveries,dips);
        for(const edge of [event.start,event.start+event.duration,-lamp.phase+(cycle+1)*lamp.period]) {
            assert(Math.abs(sample(edge-.000001)[i]-sample(edge+.000001)[i])<.00001,
                'no phase-wrap jumps');
        }
    }
    if(lamp.behaviour==='flutter') flutterCount++; else switchCount++;
}
console.log(JSON.stringify({status:'PASS',measuredOutdoorLamps:lamps.length,flutterCount,switchCount,
    illuminatedSurfaces:surfaceLamps.length,firstFlash:eventFor(0).start,deterministic:true,noRendering:true}));
