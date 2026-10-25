/* Distant fictional surface explosions on the visible planet, not foreground
 * terrain. Browser and native Cairo use this exact deterministic timeline. */
export const PLANET_ASSET_FILES = Object.freeze({planetMushroom: 'planet-mushroom-atlas.png'});

const TILE_WIDTH = 128, TILE_HEIGHT = 176, FRAMES = 64, COLUMNS = 8, LIFETIME = 19;
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { v=clamp(v); return v*v*(3-2*v); };

// Fixed roots on the photographed planet's textured face. Rotation follows
// the upper-right local surface normal as the limb curves toward the horizon.
const SITES = Object.freeze([
    {x:975, y:182, width:46, angle:.27, period:35.7, offset:5.3},
    {x:1015, y:209, width:43, angle:.39, period:43.1, offset:1.0},
    {x:1095, y:247, width:37, angle:.52, period:49.3, offset:44.3},
]);

function eventsAt(time, intensity) {
    if (intensity <= 0) return [];
    return SITES.flatMap((site, index) => {
        const absolute = time + site.offset;
        const cycle = Math.floor(absolute/site.period);
        const age = absolute-cycle*site.period;
        if (age>=LIFETIME) return [];
        const visibility = .68+.12*intensity;
        return [{...site,index,cycle,age,visibility,
            frame:age/LIFETIME*(FRAMES-1),
            flash: smooth(age/.045)*Math.exp(-age*3.2)*visibility,
            groundFire: smooth(age/.10)*Math.exp(-age*.13)*visibility,
            capWidth:site.width*(.125+.58*(1-Math.exp(-age/4.6))),
            stage:age<.65?'flash':age<3.4?'fireball':age<13?'rising mushroom':'ash decay'}];
    });
}

export function createPlanetEffects(assets) {
    if (!assets.planetMushroom) throw new Error('Missing titan planet asset: planetMushroom');

    function getDiagnostics(time, intensity=1) {
        time=Number.isFinite(time)?Math.max(0,time):0;
        intensity=Number.isFinite(intensity)?clamp(intensity):1;
        return {time,intensity,surfaceSites:SITES.map(s=>({x:s.x,y:s.y})),
            explosions:eventsAt(time,intensity),atlasFrames:FRAMES};
    }

    function render(ctx,time,intensity=1) {
        const sample=getDiagnostics(time,intensity);
        ctx.save();
        for (const event of sample.explosions) {
            ctx.save();
            ctx.translate(event.x,event.y);
            ctx.rotate(event.angle);

            // The incandescent foot is small and stays on the surface while
            // the cap rises. A brief soft illumination, never a drawn icon.
            ctx.globalCompositeOperation='screen';
            const spread=5+event.flash*8+event.groundFire*9;
            const illumination=ctx.createRadialGradient(0,0,0,0,0,spread);
            illumination.addColorStop(0,'rgba(255,228,169,0.95)');
            illumination.addColorStop(.22,'rgba(255,169,79,0.65)');
            illumination.addColorStop(1,'rgba(235,133,65,0)');
            ctx.globalAlpha=event.flash*.88+event.groundFire*.90;
            ctx.fillStyle=illumination;
            ctx.fillRect(-spread,-spread,spread*2,spread*2);

            const first=Math.floor(event.frame), next=Math.min(FRAMES-1,first+1);
            const mix=event.frame-first;
            const scale=event.width/TILE_WIDTH;
            const draw=frame=>ctx.drawImage(assets.planetMushroom,
                frame%COLUMNS*TILE_WIDTH,Math.floor(frame/COLUMNS)*TILE_HEIGHT,TILE_WIDTH,TILE_HEIGHT,
                -64*scale,-161*scale,TILE_WIDTH*scale,TILE_HEIGHT*scale);
            ctx.globalCompositeOperation='source-over';
            // Frames are close in time. Low-weight interpolation removes
            // visible stepping without doubled, translucent cloud contours.
            ctx.globalAlpha=event.visibility*(1-mix*.48);
            draw(first);
            if (mix>.001) { ctx.globalAlpha=event.visibility*mix; draw(next); }
            ctx.restore();
        }
        ctx.restore();
    }
    return {render,getDiagnostics};
}
