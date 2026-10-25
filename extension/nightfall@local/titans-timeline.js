/* Shared scene clock. Painting and pointer movement cannot advance it. */
export const TITANS_WIDTH = 1672;
export const TITANS_HEIGHT = 941;
export function createTitansTimeline() {
    let time = 0, intensity = 1;
    return {
        get time() { return time; },
        get intensity() { return intensity; },
        update(dt, value = intensity) {
            if (Number.isFinite(value)) intensity = Math.max(0, Math.min(1, value));
            if (Number.isFinite(dt) && dt > 0) time += Math.min(.1, dt);
        },
    };
}
