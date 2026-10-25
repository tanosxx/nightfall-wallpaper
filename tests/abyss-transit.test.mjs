import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const api = {window: {}};
vm.runInNewContext(await readFile(new URL('../abyss-transit.js', import.meta.url), 'utf8'), api);
const {sample, bridges, floorAt} = api.window.ABYSS_TRANSIT;
let previous = sample(0), stops = [0, 0], visible = [0, 0];
const directions = [new Set(), new Set()];
for (let t = 0; t < 240; t += .05) {
    const people = sample(t);
    assert.equal(JSON.stringify(people), JSON.stringify(sample(t)), 'Paused rendering is deterministic');
    assert.equal(people.length, 2);
    people.forEach((p, i) => {
        const b = bridges[i], bounds = b.bounds;
        assert(p.x >= bounds.x && p.x <= bounds.x + bounds.w);
        assert(p.y <= bounds.y + bounds.h && p.y - p.height >= bounds.y);
        assert(p.height >= 10 && p.height <= 18, 'Perspective human scale');
        assert.equal(p.y, floorAt(b.route, p.x), 'Feet follow the projected tunnel floor');
        assert(p.opacity >= 0 && p.opacity <= .48 && p.visibility >= 0 && p.visibility <= 1);
        assert(Math.abs(p.x - previous[i].x) < .31, 'No jumps at stops or routine wrap');
        assert(Math.abs(p.y - previous[i].y) < .25, 'No vertical jumps across curved coupling');
        if (p.stopped) { stops[i]++; assert.equal(p.opacity, 0, 'Stops and turns are inside opaque door collars'); }
        if (p.opacity > .25) {visible[i]++; directions[i].add(p.direction);}
        if (p.x <= b.visible[0] || p.x >= b.visible[1]) assert.equal(p.opacity, 0, 'People vanish inside structures');
    });
    previous = people;
}
for (let i = 0; i < 2; i++) {
    assert(stops[i] > 500 && visible[i] > 1500, 'Each routine has travel and long doorway pauses');
    assert.equal(directions[i].size, 2, 'Both travel directions are represented');
    assert(Math.abs(sample(5)[i].x - sample(0)[i].x) > 20, 'Movement visible over five seconds');
    assert(bridges[i].panes.length >= 7, 'Separate source-aligned panes preserve ribs');
}
assert.notEqual(sample(0)[0].direction, sample(0)[1].direction, 'Passages have asynchronous opposite movement');
for (const t of [NaN, Infinity, -2]) assert.equal(JSON.stringify(sample(t)), JSON.stringify(sample(0)));
console.log('PASS: two proportionate passage pedestrians, sloped floors, separate glass masks, doorway stops, smooth return journeys and deterministic pause.');
