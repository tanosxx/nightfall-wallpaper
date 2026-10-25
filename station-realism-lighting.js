/* Photographic station lighting. The source already contains the main light and
 * its shadows: keep that light fixed, and change the station's practical lamps.
 * Camera-space axes are +X right, +Y up, +Z toward the viewer. */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = value => value * value * value * (value * (value * 6 - 15) + 10);
const TRANSITION_SECONDS = 5;
const sourceDirection = [-0.60, 0.56, 0.58];
const sourceLength = Math.hypot(...sourceDirection);
const FIXED_DIRECTION = sourceDirection.map(value => value / sourceLength);
const MODES = {
    shift: {
        ambient: 0.99, key: 0.025, gloss: 0.06, coolness: 0.10,
        sectorWeights: [1, 1, 1], weldGain: 0.58, windowFactor: 1,
        workLightGain: 0.42, exteriorGain: 1,
    },
    night: {
        ambient: 0.84, key: 0.018, gloss: 0.06, coolness: 0.25,
        sectorWeights: [1, 1, 1], weldGain: 0.28, windowFactor: 0.88,
        workLightGain: 0.15, exteriorGain: 0.62,
    },
    service: {
        ambient: 0.98, key: 0.025, gloss: 0.06, coolness: 0.12,
        sectorWeights: [1, 1, 1], weldGain: 1, windowFactor: 1,
        workLightGain: 0.95, exteriorGain: 0.94,
    },
};
const clone = profile => ({...profile, sectorWeights: [...profile.sectorWeights]});

export const STATION_MODES = Object.freeze(['shift', 'night', 'service']);

export function createStationLighting(mode = 'shift') {
    mode = STATION_MODES.includes(mode) ? mode : 'shift';
    const controller = {time: 0, mode, targetMode: mode, state: {}};
    let current = clone(MODES[mode]);
    let from = clone(current);
    let target = clone(current);
    let elapsed = TRANSITION_SECONDS;

    function expose() {
        const state = controller.state;
        Object.assign(state, current);
        state.direction = [...FIXED_DIRECTION];
        state.sectorWeights = [...current.sectorWeights];
        state.darkness = 1 - current.ambient;
        // A small neutral correction preserves the photographed warm/cool split.
        state.keyColor = [
            mix(216, 202, current.coolness),
            mix(215, 215, current.coolness),
            mix(208, 225, current.coolness),
        ];
        // Compatibility with the earlier renderer: never sweep a band over the hull.
        state.scanGain = 0;
        state.scanPosition = 0;
        state.scanWidth = 0.085;
        state.transition = clamp(elapsed / TRANSITION_SECONDS, 0, 1);
    }

    controller.setMode = (id, immediate = false) => {
        if (!STATION_MODES.includes(id)) return false;
        if (id === controller.targetMode && !immediate) return true;
        controller.targetMode = id;
        from = clone(current);
        target = clone(MODES[id]);
        elapsed = immediate ? TRANSITION_SECONDS : 0;
        if (immediate) {
            current = clone(target);
            controller.mode = id;
        }
        expose();
        return true;
    };

    controller.update = dt => {
        dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
        controller.time += dt;
        if (elapsed < TRANSITION_SECONDS && dt > 0) {
            elapsed = Math.min(TRANSITION_SECONDS, elapsed + dt);
            if (TRANSITION_SECONDS - elapsed < 1e-9) elapsed = TRANSITION_SECONDS;
            if (elapsed === TRANSITION_SECONDS) {
                current = clone(target);
                controller.mode = controller.targetMode;
            } else {
                const amount = smooth(elapsed / TRANSITION_SECONDS);
                current = {};
                for (const key of Object.keys(target)) {
                    current[key] = Array.isArray(target[key])
                        ? target[key].map((value, index) => mix(from[key][index], value, amount))
                        : mix(from[key], target[key], amount);
                }
            }
        }
        expose();
        return controller.state;
    };

    expose();
    return controller;
}
