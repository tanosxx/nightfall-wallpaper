// One continuous photographed cloud bank, deformed by a smooth evolving field.
// No repeated puff sprites or crossfading shifted copies of the cloud. Source
// and destination mattes exclude all solid geometry; the titan stays fixed.
export const LEFT_SMOKE_ASSET_FILES = Object.freeze({leftSmokeFlow: 'left-cloud-flow.png'});
const WIDTH = 442, HEIGHT = 316, FRAME_WIDTH = 332, FRAME_HEIGHT = 237;
const FRAMES = 96, COLUMNS = 12, DURATION = 48;

export function createLeftSmokeEffects(assets) {
    if (!assets.leftSmokeFlow) throw new Error('Missing left titan smoke atlas');
    function render(ctx, time, intensity = 1) {
        if (!(intensity > 0)) return;
        const amount = Math.min(1, intensity);
        const position = (((Number.isFinite(time) ? time : 0) % DURATION + DURATION) % DURATION) / DURATION * FRAMES;
        const current = Math.floor(position), next = (current + 1) % FRAMES, blend = position - current;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = amount;
        ctx.drawImage(assets.leftSmokeFlow,
            current % COLUMNS * FRAME_WIDTH, Math.floor(current / COLUMNS) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
            0, 0, WIDTH, HEIGHT);
        if (blend > .0001) {
            ctx.globalAlpha = amount * blend;
            ctx.drawImage(assets.leftSmokeFlow,
                next % COLUMNS * FRAME_WIDTH, Math.floor(next / COLUMNS) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
                0, 0, WIDTH, HEIGHT);
        }
        ctx.restore();
    }
    return {render, getDiagnostics(time, intensity) {
        return {time, intensity, photographicClouds: true, model: 'coherent-billowing',
            repeatedPuffs: false, bounds: [0, 0, WIDTH, HEIGHT], frames: FRAMES, duration: DURATION};
    }};
}
