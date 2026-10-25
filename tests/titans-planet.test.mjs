import assert from 'node:assert/strict';
import {createPlanetEffects,PLANET_ASSET_FILES} from '../extension/nightfall@local/titans-planet-blasts.js';

assert.deepEqual(Object.keys(PLANET_ASSET_FILES),['planetMushroom']);
const effects=createPlanetEffects({planetMushroom:{}});
const first=effects.getDiagnostics(0,1);
assert.equal(first.explosions.length,2,'A developed mushroom and an early fireball must be visible immediately');
assert(first.explosions.some(e=>e.stage==='rising mushroom'));
assert(first.explosions.some(e=>e.stage==='fireball'));
assert(first.explosions.every(e=>e.x>=930&&e.x<=1100&&e.y<260));
assert.equal(effects.getDiagnostics(0,0).explosions.length,0);
assert.deepEqual(effects.getDiagnostics(0,1),first,'Painting and inspection do not mutate the timeline');
for(let time=0;time<200;time+=.1){
    for(const e of effects.getDiagnostics(time,1).explosions){
        assert(e.age>=0&&e.age<19);
        assert(e.frame>=0&&e.frame<64);
        assert(e.capWidth<34,'Distant caps must not become foreground-sized');
        assert(e.angle>=.27&&e.angle<=.52);
    }
}
assert.notDeepEqual(first,effects.getDiagnostics(2,1),'Clouds must change between frames');
console.log('Planet surface locations, first-frame visibility, deterministic lifecycle and perspective passed.');
