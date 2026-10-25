import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createStationLighting, STATION_MODES} from '../station-realism-lighting.js';

const stable = value => JSON.stringify(value);
const light = createStationLighting();
const initial = stable(light);
const direction = stable(light.state.direction);
assert.equal(light.setMode('invalid'), false);
assert.equal(stable(light), initial);
assert.equal(createStationLighting('invalid').mode, 'shift');

// The completed lighting state has no global oscillation, even across a long run.
for (const mode of STATION_MODES) {
    light.setMode(mode, true);
    const state = stable(light.state);
    for (let frame = 0; frame < 24 * 60 * 5; frame++) light.update(1 / 24);
    assert.equal(stable(light.state), state, `${mode} must not breathe or move its key light`);
    assert.equal(stable(light.state.direction), direction);
    assert(Math.abs(Math.hypot(...light.state.direction) - 1) < 1e-12);
    assert.equal(light.state.scanGain, 0);
}

// Repeated settings messages must not restart a transition. Endpoints are exact.
light.setMode('shift', true);
const shiftAmbient = light.state.ambient;
light.setMode('night');
assert.equal(light.state.ambient, shiftAmbient);
let previousAmbient = shiftAmbient;
let previousWorkLight = light.state.workLightGain;
for (let frame = 0; frame < 120; frame++) {
    light.setMode('night');
    light.update(1 / 24);
    assert(light.state.ambient <= previousAmbient);
    assert(light.state.workLightGain <= previousWorkLight);
    assert(light.state.transition >= 0 && light.state.transition <= 1);
    assert.equal(stable(light.state.direction), direction);
    assert.equal(light.state.scanGain, 0);
    previousAmbient = light.state.ambient;
    previousWorkLight = light.state.workLightGain;
}
assert.equal(light.mode, 'night');
assert.equal(light.state.transition, 1);
assert.equal(light.state.ambient, 0.84);
assert(light.state.windowFactor > 0.8, 'night mode retains lived-in emissive windows');

// Pausing also pauses an unfinished transition. Bad frame times must not advance it.
light.setMode('service');
light.update(0.1);
const paused = stable(light);
for (const dt of [0, -1, NaN, Infinity, undefined]) {
    light.update(dt);
    assert.equal(stable(light), paused);
}
light.setMode('shift');
assert.equal(stable(light.state.ambient), stable(JSON.parse(paused).state.ambient));
for (let frame = 0; frame < 50; frame++) light.update(0.1);
assert.equal(light.mode, 'shift');
assert.equal(light.state.ambient, shiftAmbient);

// Selecting a mode while paused is immediate, with the same fixed exterior key.
light.setMode('service', true);
assert.equal(light.mode, 'service');
assert.equal(light.state.transition, 1);
assert(light.state.workLightGain > createStationLighting('shift').state.workLightGain * 2);
assert.equal(stable(light.state.direction), direction);

const context = {window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../station-realism-lighting-browser.js', import.meta.url), 'utf8'), context);
const moduleController = createStationLighting();
const browserController = context.window.STATION_LIGHTING.createStationLighting();
for (let frame = 0; frame < 1000; frame++) {
    if (frame % 81 === 0) {
        const mode = STATION_MODES[Math.floor(frame / 81) % STATION_MODES.length];
        const immediate = frame % 243 === 0;
        moduleController.setMode(mode, immediate);
        browserController.setMode(mode, immediate);
    }
    const dt = frame % 17 === 0 ? 0 : 1 / 24;
    moduleController.update(dt);
    browserController.update(dt);
    assert.equal(stable(moduleController), stable(browserController));
}
console.log('PASS: fixed source direction; no time-driven global changes; five-second continuous transitions; pause and retarget behavior; local work-light mode emphasis; exact browser/module parity.');
