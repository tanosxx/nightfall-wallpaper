/* Quiet pedestrian movement inside the photographed glass passages.
 * Source coordinates, source-colour glass masks, and deterministic scene-time
 * sampling keep people behind the tunnel ribs and fixed reflections.
 */
(function () {
    'use strict';
    const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
    const smooth = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
    const BRIDGES = [
        {
            id: 'west-passage', bounds: {x: 591, y: 347, w: 223, h: 100},
            // The large coupling at x741–761 separates two glass sections.
            panes: [
                [[601,364],[609,366],[609,385],[601,383]],
                [[613,367],[625,369],[625,389],[613,386]],
                [[629,370],[643,373],[643,393],[629,390]],
                [[647,374],[661,377],[661,397],[647,394]],
                [[665,378],[681,381],[681,402],[665,398]],
                [[685,382],[703,386],[703,407],[685,403]],
                [[707,387],[723,390],[723,411],[707,408]],
                [[727,391],[738,394],[738,414],[727,412]],
                [[764,400],[780,403],[780,435],[764,431]],
                [[785,405],[795,408],[795,438],[785,436]],
            ],
            route: [[595,384],[738,414],[760,431],[806,440]],
            visible: [604,793], fade: 9, height: [13.1,17.2],
            travel: 39, stopFar: 6.8, stopNear: 9.2, offset: 8.4, initialDirection: 1,
        },
        {
            id: 'east-passage', bounds: {x: 1316, y: 252, w: 160, h: 95},
            panes: [
                [[1325,275],[1343,278],[1343,318],[1325,315]],
                [[1349,279],[1366,281],[1366,321],[1349,319]],
                [[1371,282],[1387,284],[1387,324],[1371,322]],
                [[1393,285],[1409,287],[1409,327],[1393,325]],
                [[1415,288],[1430,290],[1430,330],[1415,328]],
                [[1436,291],[1448,293],[1448,333],[1436,331]],
                [[1453,294],[1463,296],[1463,335],[1453,333]],
            ],
            route: [[1317,314],[1473,336]],
            visible: [1325,1463], fade: 8, height: [16.0,17.7],
            travel: 28, stopFar: 9.4, stopNear: 7.6, offset: 15.2, initialDirection: -1,
        },
    ];

    function easedDistance(t, duration) {
        const a = .8, span = duration - a;
        if (t < a) return t * t / (2 * a * span);
        if (t > duration - a) return 1 - (duration - t) ** 2 / (2 * a * span);
        return (t - a / 2) / span;
    }
    function floorAt(route, x) {
        for (let i = 1; i < route.length; i++) {
            if (x <= route[i][0]) {
                const a = route[i - 1], b = route[i], p = clamp((x - a[0]) / (b[0] - a[0]));
                return a[1] + (b[1] - a[1]) * p;
            }
        }
        return route[route.length - 1][1];
    }
    function sample(time) {
        const t = Math.max(0, Number.isFinite(time) ? time : 0);
        return BRIDGES.map((bridge, i) => {
            const period = bridge.travel * 2 + bridge.stopFar + bridge.stopNear;
            const p = (t + bridge.offset) % period, returnStart = bridge.travel + bridge.stopFar;
            let u, direction, pace, stopped;
            if (p < bridge.travel) {
                u = easedDistance(p, bridge.travel); direction = 1; stopped = false;
                pace = smooth(p / .8) * smooth((bridge.travel - p) / .8);
            } else if (p < returnStart) {
                u = 1; direction = 1; pace = 0; stopped = true;
            } else if (p < returnStart + bridge.travel) {
                const q = p - returnStart;
                u = 1 - easedDistance(q, bridge.travel); direction = -1; stopped = false;
                pace = smooth(q / .8) * smooth((bridge.travel - q) / .8);
            } else { u = 0; direction = -1; pace = 0; stopped = true; }
            if (bridge.initialDirection < 0) { u = 1 - u; direction *= -1; }
            const x0 = bridge.route[0][0], x1 = bridge.route[bridge.route.length - 1][0];
            const x = x0 + (x1 - x0) * u, y = floorAt(bridge.route, x);
            const visibility = smooth((x - bridge.visible[0]) / bridge.fade)
                * smooth((bridge.visible[1] - x) / bridge.fade);
            return {
                id: bridge.id + '-pedestrian', bridge: i, x, y,
                height: bridge.height[0] + (bridge.height[1] - bridge.height[0]) * u,
                direction, pace, stopped, visibility, opacity: .48 * visibility,
                stride: Math.sin(t * (6.25 + i * .33) + i * 2.1) * pace,
                bob: Math.abs(Math.sin(t * (6.25 + i * .33) + i * 2.1)) * .12 * pace,
            };
        });
    }

    function canvas(w, h) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    function poly(ctx, points) {
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
    }
    function glassMask(photo, bridge) {
        const b = bridge.bounds, image = canvas(b.w, b.h), ctx = image.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(photo, -b.x, -b.y);
        const data = ctx.getImageData(0, 0, b.w, b.h);
        for (let p = 0; p < data.data.length; p += 4) {
            const r = data.data[p], g = data.data[p + 1], blue = data.data[p + 2];
            const warm = smooth((r - blue - 2) / 44);
            const luminance = r * .28 + g * .57 + blue * .15;
            // The blue roof reflection and dark ribs stay dominant; visible
            // motion is strongest through the actual amber interior pixels.
            const body = smooth((luminance - 25) / 60) * (.24 + .76 * warm);
            const reflection = 1 - .38 * smooth((blue - r + 2) / 45);
            data.data[p] = data.data[p + 1] = data.data[p + 2] = 255;
            data.data[p + 3] = Math.round(236 * body * reflection);
        }
        ctx.putImageData(data, 0, 0);
        const panes = canvas(b.w, b.h), paneCtx = panes.getContext('2d');
        paneCtx.translate(-b.x, -b.y); paneCtx.fillStyle = '#fff';
        bridge.panes.forEach(points => { poly(paneCtx, points); paneCtx.fill(); });
        ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(panes, 0, 0);
        return image;
    }
    function limb(ctx, a, b, end, width) {
        ctx.beginPath(); ctx.moveTo(a[0] - width, a[1]);
        ctx.quadraticCurveTo(b[0] - width * .8, b[1], end[0] - width * .5, end[1]);
        ctx.lineTo(end[0] + width * .5, end[1]);
        ctx.quadraticCurveTo(b[0] + width * .8, b[1], a[0] + width, a[1]);
        ctx.closePath(); ctx.fill();
    }
    function person(ctx, state) {
        const h = state.height, stride = state.stride * h * .08;
        ctx.save(); ctx.translate(state.x, state.y - state.bob); ctx.scale(state.direction, 1);
        ctx.globalAlpha = state.opacity; ctx.fillStyle = '#34322d';
        ctx.beginPath(); ctx.ellipse(.15, -h * .89, h * .106, h * .113, -.04, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-h * .13, -h * .76);
        ctx.quadraticCurveTo(.1, -h * .84, h * .14, -h * .76);
        ctx.lineTo(h * .11, -h * .42); ctx.quadraticCurveTo(0, -h * .39, -h * .11, -h * .42);
        ctx.closePath(); ctx.fill();
        limb(ctx, [-h * .05,-h * .43], [-.7 - stride * .65,-h * .21], [-.75 - stride,-.3], h * .052);
        limb(ctx, [h * .05,-h * .43], [.7 + stride * .65,-h * .21], [.75 + stride,-.3], h * .052);
        limb(ctx, [-h * .12,-h * .73], [-h * .15 - stride * .45,-h * .55], [-h * .12 - stride * .55,-h * .43], h * .042);
        limb(ctx, [h * .12,-h * .73], [h * .16 + stride * .45,-h * .56], [h * .12 + stride * .55,-h * .44], h * .044);
        ctx.restore();
    }
    function createAbyssTransit(photo) {
        const layers = BRIDGES.map(bridge => {
            const b = bridge.bounds, layer = canvas(b.w, b.h);
            return {bridge, layer, ctx: layer.getContext('2d'), mask: glassMask(photo, bridge)};
        });
        return {
            render(ctx, time) {
                const people = sample(time);
                ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                layers.forEach((layer, i) => {
                    const p = layer.ctx, b = layer.bridge.bounds;
                    p.setTransform(1,0,0,1,0,0); p.clearRect(0,0,b.w,b.h);
                    p.save(); p.translate(-b.x,-b.y); p.filter = 'blur(0.32px)';
                    person(p,people[i]); p.restore();
                    p.globalCompositeOperation = 'destination-in'; p.drawImage(layer.mask,0,0);
                    p.globalCompositeOperation = 'source-over';
                    ctx.drawImage(layer.layer,b.x,b.y);
                });
                ctx.restore();
            },
        };
    }
    window.ABYSS_TRANSIT = {sample, bridges: BRIDGES, floorAt};
    window.createAbyssTransit = createAbyssTransit;
})();
