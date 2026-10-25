/* Tiny, distant inhabitants behind the observatory's existing glazing.
 * Geometry is in the source photograph's 1672 × 941 coordinates. The glass
 * mask is sampled once from the photograph, leaving its mullions, reflections
 * and foreground desks in front of the motion. No simulation state is kept.
 */
(function () {
    'use strict';

    const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
    const smooth = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const BOUNDS = {x: 838, y: 252, w: 432, h: 91};
    // Individual glass panes deliberately stop short of the dark mullions.
    const PANES = [
        [[858,257],[869,259],[869,316],[858,312]],
        [[877,260],[897,263],[897,320],[877,317]],
        [[903,264],[915,265],[915,322],[903,320]],
        [[919,265],[944,267],[944,325],[919,322]],
        rect(958,269,10,58),
        rect(983,273,21,56), rect(1009,273,17,56),
        rect(1030,274,14,55), rect(1048,274,15,55),
        rect(1084,273,17,58), rect(1105,273,16,58),
        rect(1125,273,17,58), rect(1146,273,14,58),
        [[1180,273],[1194,272],[1194,330],[1180,331]],
        [[1198,272],[1217,271],[1217,329],[1198,330]],
        [[1221,271],[1236,270],[1236,328],[1221,329]],
        [[1241,270],[1251,269],[1251,326],[1241,328]],
    ];
    const FURNITURE = [
        [[882,305],[901,307],[901,310],[882,308]],
        [[923,310],[941,311],[941,315],[923,314]],
        [[991,314],[1026,314],[1026,318],[991,318]],
        [[1087,315],[1120,315],[1120,319],[1087,319]],
        [[1128,314],[1152,314],[1152,320],[1128,320]],
        [[1183,313],[1218,312],[1218,316],[1183,317]],
    ];
    const MONITORS = [
        {x: 1141.8, y: 308.2, rx: 2.7, ry: 2.2},
        {x: 1094.3, y: 307.2, rx: 2.0, ry: 1.6},
        {x: 892.0, y: 303.8, rx: 2.1, ry: 1.5},
        {x: 931.0, y: 308.1, rx: 2.0, ry: 1.4},
        {x: 1016.0, y: 310.0, rx: 2.1, ry: 1.5},
    ];

    // Each person has a complete, closed routine. Positions, sitting and task
    // gestures are sampled from time, including the short arrival/departure.
    const ROUTINES = [
        {id:'walking-researcher',height:22.3,opacity:.64,offset:10.2,colour:'#35352e',carry:true,
            nodes:[{x:1007,y:324,wait:7,travel:17,action:'read',facing:-1},
                {x:1110,y:324,wait:8,travel:17,action:'work',facing:1}]},
        {id:'west-technician',height:21.5,opacity:.65,offset:8.6,colour:'#3b3830',carry:true,
            nodes:[{x:884,y:318,wait:5,travel:10,action:'inspect',facing:-1},
                {x:938,y:323,wait:10,travel:10,action:'work',facing:1}]},
        {id:'central-assistant',height:21.5,opacity:.61,offset:19,colour:'#363b3b',carry:true,
            nodes:[{x:998,y:318,wait:8,travel:10,action:'read',facing:-1},
                {x:1035,y:318,wait:11,travel:10,action:'inspect',facing:1}]},
        {id:'seated-operator',height:23,opacity:.65,offset:5,colour:'#34332e',
            nodes:[{x:1132,y:319,wait:16,travel:6,action:'work',seated:true,facing:1},
                {x:1149,y:319,wait:11,travel:6,action:'read',seated:true,facing:-1}]},
        {id:'resting-observer',height:22,opacity:.61,offset:3,colour:'#433a30',
            nodes:[{x:1206,y:320,wait:12,travel:7,action:'drink',seated:true,facing:-1},
                {x:1228,y:321,wait:13,travel:7,action:'look',facing:1}]},
        {id:'right-colleague',height:21.6,opacity:.63,offset:8,colour:'#353e3c',
            nodes:[{x:1187,y:321,wait:17,travel:8,action:'talk',facing:1},
                {x:1210,y:321,wait:8,travel:8,action:'inspect',facing:-1}]},
        {id:'background-analyst',height:19,opacity:.53,offset:4,colour:'#443b31',
            nodes:[{x:1094,y:313,wait:14,travel:9,action:'work',seated:true,facing:1},
                {x:1055,y:317,wait:10,travel:9,action:'inspect',facing:-1}]},
        {id:'west-seated-operator',height:19.5,opacity:.58,offset:2,colour:'#3f3c30',settled:true,
            nodes:[{x:888,y:312,wait:13,travel:0,action:'work',seated:true,facing:1},
                {x:888,y:312,wait:9,travel:0,action:'read',seated:true,facing:1}]},
    ].map(routine=>({...routine,period:routine.nodes.reduce((sum,node)=>sum+node.wait+node.travel,0)}));

    // A walk, a short task at the desk, the return walk, then a longer pause.
    // The tiny ease-in/out occurs only at either end, not across the route.
    function progress(t, duration) {
        const a = .65, distance = duration - a;
        if (t < a) return t * t / (2 * a * distance);
        if (t > duration - a) {
            const remaining = duration - t;
            return 1 - remaining * remaining / (2 * a * distance);
        }
        return (t - a / 2) / distance;
    }

    function resident(routine,index,t) {
        let phase=(t+routine.offset)%routine.period;
        for(let n=0;n<routine.nodes.length;n++) {
            const node=routine.nodes[n],next=routine.nodes[(n+1)%routine.nodes.length];
            const state={id:routine.id,height:routine.height,opacity:routine.opacity,colour:routine.colour,
                x:node.x,y:node.y,direction:node.facing,pace:0,stride:0,bob:0,sit:0,
                lean:0,reach:0,armLift:0,gesture:0,headTurn:0,carry:0,working:false};
            if(phase<node.wait) {
                const envelope=smooth(phase/.85)*smooth((node.wait-phase)/.85);
                const rhythm=t*(1.3+index*.09)+index*1.7;
                state.sit=node.seated?(routine.settled?1:smooth(phase/1.3)*smooth((node.wait-phase)/1.4)):0;
                state.pose=state.sit>.5?'seated':node.action;
                state.action=node.action;
                state.headTurn=Math.sin(t*.57+index*1.9)*.48*envelope;
                state.lean=(.045+.035*Math.sin(t*.8+index))*envelope;
                if(node.action==='work') {
                    state.working=true;state.reach=(.58+.20*Math.sin(rhythm*2.1))*envelope;
                    state.gesture=(.20+.16*Math.sin(rhythm*1.7+.7))*envelope;
                    state.armLift=(.28+.07*Math.sin(rhythm*2.4))*envelope;
                    state.lean=(.08+.035*Math.sin(rhythm*.55))*envelope;
                } else if(node.action==='read') {
                    state.reach=.62*envelope;state.carry=envelope;state.armLift=.24*envelope;
                    state.headTurn=.18*Math.sin(rhythm*.5)*envelope;
                } else if(node.action==='drink') {
                    const sip=Math.pow(.5+.5*Math.sin(rhythm*.55),3)*envelope;
                    state.reach=.34*envelope;state.armLift=.80*sip;state.cup=envelope;
                } else if(node.action==='talk') {
                    state.reach=(.38+.31*Math.sin(rhythm*.86))*envelope;
                    state.armLift=(.17+.14*Math.sin(rhythm*.7))*envelope;
                    state.gesture=(.26+.20*Math.sin(rhythm*.63))*envelope;
                } else if(node.action==='inspect') {
                    state.reach=(.65+.18*Math.sin(rhythm*.6))*envelope;
                    state.armLift=(.34+.22*Math.sin(rhythm*.8))*envelope;
                }
                return state;
            }
            phase-=node.wait;
            if(phase<node.travel) {
                const u=progress(phase,node.travel),pace=smooth(phase/.65)*smooth((node.travel-phase)/.65);
                state.x=node.x+(next.x-node.x)*u;state.y=node.y+(next.y-node.y)*u;
                state.direction=next.x>=node.x?1:-1;state.pace=pace;state.pose='walking';state.action='walking';
                state.stride=Math.sin(t*(6.05+index*.13)+index)*pace;
                state.bob=Math.abs(state.stride)*.19;state.carry=routine.carry?pace*.7:0;
                return state;
            }
            phase-=node.travel;
        }
    }

    function sample(time) {
        const t=Math.max(0,Number.isFinite(time)?time:0);
        return {
            people:ROUTINES.map((routine,i)=>resident(routine,i,t)),
            monitorPower:MONITORS.map((_,i)=>.14+.055*Math.sin(t*(.69+i*.19)+i*2.3)
                +.065*Math.pow(.5+.5*Math.sin(t*1.43+i),8)),
            monitorScan:MONITORS.map((_,i)=>(t*(.08+i*.012)+i*.29)%1),
        };
    }

    function makeCanvas(width, height) {
        const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
    }
    function polygon(ctx, points) {
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
        ctx.closePath();
    }
    function makeGlassMask(photo) {
        const canvas = makeCanvas(BOUNDS.w, BOUNDS.h);
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(photo, -BOUNDS.x, -BOUNDS.y);
        const pixels = ctx.getImageData(0, 0, BOUNDS.w, BOUNDS.h);
        for (let n = 0; n < pixels.data.length; n += 4) {
            const r = pixels.data[n], g = pixels.data[n + 1], b = pixels.data[n + 2];
            // Dark furniture and blue-grey structural steel are opaque in
            // front. Warm glass remains partially reflective over the people.
            const warm = smooth((r - b - 12) / 46);
            const bright = smooth((r - 57) / 89) * smooth((g - 34) / 58);
            pixels.data[n] = pixels.data[n + 1] = pixels.data[n + 2] = 255;
            // A dark object deeper in the room must not erase a nearer person.
            // Actual foreground desks and glazing bars are masked separately.
            pixels.data[n + 3] = Math.round(236 * (.38 + .62 * warm * bright));
        }
        ctx.putImageData(pixels, 0, 0);
        const panes = makeCanvas(BOUNDS.w, BOUNDS.h), p = panes.getContext('2d');
        p.translate(-BOUNDS.x, -BOUNDS.y); p.fillStyle = '#fff';
        PANES.forEach(points => { polygon(p, points); p.fill(); });
        p.globalCompositeOperation = 'destination-out';
        FURNITURE.forEach(points => { polygon(p, points); p.fill(); });
        ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(panes, 0, 0);
        return canvas;
    }

    // Filled, tapered forms stay convincing at this distance; limbs are not
    // bright lines and there is no face or high-contrast stick-figure outline.
    function limb(ctx, x0, y0, x1, y1, x2, y2, width) {
        ctx.beginPath(); ctx.moveTo(x0 - width, y0);
        ctx.quadraticCurveTo(x1 - width * .8, y1, x2 - width * .55, y2);
        ctx.lineTo(x2 + width * .55, y2);
        ctx.quadraticCurveTo(x1 + width * .8, y1, x0 + width, y0);
        ctx.closePath(); ctx.fill();
    }
    function person(ctx, figure) {
        const h = figure.height, sit = figure.sit, drop = sit * h * .18;
        const mix = (a,b) => a + (b-a)*sit;
        ctx.save(); ctx.translate(figure.x, figure.y - figure.bob);
        ctx.scale(figure.direction, 1);
        ctx.globalAlpha = figure.opacity;
        ctx.fillStyle = figure.colour;
        const lean = figure.lean * h, hipY = -h * .43 + drop * .7;
        const shoulderY = -h * .76 + drop, shoulderX = lean * .7;
        const headX = lean + (figure.headTurn || 0) * 1.6;
        ctx.beginPath();
        ctx.ellipse(headX, -h * .895 + drop, h * .105, h * .115, -.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(shoulderX - h * .14, shoulderY);
        ctx.quadraticCurveTo(shoulderX, -h * .84 + drop, shoulderX + h * .14, shoulderY);
        ctx.lineTo(h * .105, hipY); ctx.quadraticCurveTo(0, hipY + .8, -h * .115, hipY);
        ctx.closePath(); ctx.fill();
        const stride = figure.stride * h * .09;
        limb(ctx,-h*.055,hipY,mix(-1.1-stride*.6,2.8),mix(-h*.22,hipY+1),mix(-1.15-stride,2.6),-.7,h*.055);
        limb(ctx,h*.055,hipY,mix(1.1+stride*.6,5.0),mix(-h*.21,hipY+1.5),mix(1.15+stride,5.2),-.5,h*.055);
        const arm = figure.stride * h * .055;
        const gesture = figure.gesture * h * .19;
        limb(ctx, shoulderX - h * .12, shoulderY + .7, -h * .16 - arm, -h * .57,
            -h * .12 - arm - gesture, -h * .44 + drop*.6 - gesture*.7 - figure.armLift*h*.22, h * .043);
        const reach = (figure.reach + figure.carry*.36) * h * .27;
        const handX = h * .13 + reach + arm * .5 - figure.armLift*h*.08;
        const handY = -h * .48 - reach * .14 + drop*.7 - figure.armLift*h*.37;
        limb(ctx, shoulderX + h * .12, shoulderY + .6, h * .19 + reach * .45, -h * .58 + drop*.6,
            handX,handY,h*.048);
        if(figure.carry>0) {
            ctx.globalAlpha=figure.opacity*figure.carry*.78;ctx.fillStyle='#b6aa83';
            ctx.save();ctx.translate(handX,handY);ctx.rotate(-.18);
            ctx.fillRect(-1,-1,h*.19,h*.14);ctx.restore();
        }
        if(figure.cup>0) {
            ctx.globalAlpha=figure.opacity*figure.cup*.75;ctx.fillStyle='#a09273';
            ctx.fillRect(handX-.7,handY-1,h*.075,h*.10);
        }
        ctx.restore();
    }

    function createAbyssInterior(photo) {
        const mask = makeGlassMask(photo);
        const layer = makeCanvas(BOUNDS.w, BOUNDS.h), paint = layer.getContext('2d');
        return {
            render(ctx, time) {
                const state = sample(time);
                paint.setTransform(1, 0, 0, 1, 0, 0); paint.clearRect(0, 0, BOUNDS.w, BOUNDS.h);
                paint.save(); paint.translate(-BOUNDS.x, -BOUNDS.y); paint.filter = 'blur(0.30px)';
                // Back-row researchers remain behind the nearer walking lane.
                [...state.people].sort((a,b)=>a.y-b.y).forEach(figure => person(paint, figure));
                paint.filter = 'none';
                MONITORS.forEach((monitor, i) => {
                    const gradient = paint.createRadialGradient(monitor.x, monitor.y, 0, monitor.x, monitor.y, 5.5);
                    gradient.addColorStop(0, 'rgba(175,210,189,.6)');
                    gradient.addColorStop(.4, 'rgba(164,201,180,.22)');
                    gradient.addColorStop(1, 'rgba(164,201,180,0)');
                    paint.globalAlpha = state.monitorPower[i]; paint.fillStyle = gradient;
                    paint.fillRect(monitor.x - 5.5, monitor.y - 5.5, 11, 11);
                    paint.fillStyle='#a6c3b2';
                    paint.fillRect(monitor.x-monitor.rx*.7,monitor.y-monitor.ry+state.monitorScan[i]*monitor.ry*2,monitor.rx*1.4,.4);
                    paint.globalAlpha=state.monitorPower[i]*.7;
                    paint.fillRect(monitor.x-monitor.rx*.6,monitor.y-.3,monitor.rx*.8,.4);
                });
                paint.restore();
                paint.globalAlpha = 1; paint.globalCompositeOperation = 'destination-in'; paint.drawImage(mask, 0, 0);
                paint.globalCompositeOperation = 'source-over';
                ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(layer, BOUNDS.x, BOUNDS.y); ctx.restore();
            },
        };
    }

    window.ABYSS_INTERIOR = {sample, routines:ROUTINES, bounds: BOUNDS, panes: PANES, furniture: FURNITURE, monitors: MONITORS};
    window.createAbyssInterior = createAbyssInterior;
})();
