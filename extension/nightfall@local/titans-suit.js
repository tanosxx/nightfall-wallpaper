/* Tiny source-aligned indicators on the photographed alien's exosuit.
 * Shared, deterministic Canvas/Cairo effect: no pointer or geometry motion. */
export const SUIT_ASSET_FILES = Object.freeze({});

const clamp = v => Math.max(0, Math.min(1,v));
const smooth = v => {v=clamp(v);return v*v*(3-2*v);};
const hash = v => {const n=Math.sin(v*127.1+311.7)*43758.5453123;return n-Math.floor(n);};

// All four points are existing warm fittings in the photograph. The two
// larger lamps sit on the backpack; the elbow and hip indicators are smaller.
const LAMPS = Object.freeze([
    {id:'back-left',x:143.1,y:428.4,radius:1.65,phase:1.1,period:7.3,seed:17},
    {id:'back-right',x:160.4,y:427.3,radius:1.70,phase:3.8,period:9.1,seed:41},
    {id:'elbow',x:246.4,y:514.9,radius:1.12,phase:.8,period:5.8,seed:73},
    {id:'hip',x:203.2,y:542.5,radius:.83,phase:2.2,period:11.3,seed:101},
]);

// Short glints follow narrow manufactured inserts; there is no new luminous
// outline round the body. Their ends remain inside the photographed armour.
const TRACES = Object.freeze([
    {id:'back-insert',points:[[149.6,445.5],[151.0,459.5],[155.4,480.5]],period:7.7,offset:.18,width:.72,length:6.8},
    {id:'forearm-insert',points:[[258.3,539.6],[265.0,559.0],[273.7,574.6]],period:10.4,offset:.67,width:.66,length:5.7},
]);

function pointAt(points,distance) {
    for(let i=1;i<points.length;i++){
        const [ax,ay]=points[i-1],[bx,by]=points[i];
        const length=Math.hypot(bx-ax,by-ay);
        if(distance<=length||i===points.length-1){
            const t=clamp(distance/length);return [ax+(bx-ax)*t,ay+(by-ay)*t];
        }
        distance-=length;
    }
    return points[0];
}

function lampSamples(time,intensity) {
    return LAMPS.map(lamp=>{
        const absolute=time+lamp.phase;
        const cycle=Math.floor(absolute/lamp.period);
        const u=absolute/lamp.period-cycle;
        const random=hash(lamp.seed+cycle*9.3);
        // A panel remains in one state for a while, then changes smoothly.
        // One short double acknowledgement is unrelated to the breathing.
        const breathing=.5+.5*Math.sin(time*(.65+lamp.seed*.0017)+lamp.phase*2.4);
        const on=smooth(u/.10)*smooth((.72+random*.12-u)/.10);
        const doublet=Math.exp(-Math.pow((u-.82)/.016,2))*.82
            +Math.exp(-Math.pow((u-.875)/.012,2))*.57;
        const power=clamp((.10+on*(.32+breathing*.48)+doublet)*intensity);
        return {...lamp,power,colour:clamp(.25+breathing*.55+doublet*.2)};
    });
}

function traceSamples(time,intensity) {
    return TRACES.map(trace=>{
        const total=trace.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-trace.points[i][0],p[1]-trace.points[i][1]),0);
        const progress=(time/trace.period+trace.offset)%1;
        const head=progress*(total+trace.length);
        const tail=Math.max(0,head-trace.length);
        return {id:trace.id,width:trace.width,progress,
            from:pointAt(trace.points,tail),to:pointAt(trace.points,Math.min(total,head)),
            alpha:smooth(progress/.13)*smooth((1-progress)/.18)*intensity};
    });
}

export function createSuitEffects(_assets={}) {
    function getDiagnostics(time,intensity=1) {
        time=Number.isFinite(time)?Math.max(0,time):0;
        intensity=Number.isFinite(intensity)?clamp(intensity):1;
        return {time,intensity,geometryTransforms:0,lamps:lampSamples(time,intensity),
            traces:traceSamples(time,intensity)};
    }
    function render(ctx,time,intensity=1) {
        const sample=getDiagnostics(time,intensity);
        if(sample.intensity<=0)return;
        ctx.save();
        for(const lamp of sample.lamps){
            // Dim only the existing photographic LED core, smoothly and over
            // a few pixels. This lets its light genuinely decrease as well as
            // brighten, without a dark rectangular overlay on the armour.
            const extent=lamp.radius*2.2;
            const dim=ctx.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,extent);
            dim.addColorStop(0,'rgba(22,14,12,1)');
            dim.addColorStop(.32,'rgba(55,36,29,0.9)');
            dim.addColorStop(1,'rgba(255,255,255,0)');
            ctx.globalCompositeOperation='multiply';
            ctx.globalAlpha=(1-lamp.power)*.86*sample.intensity;
            ctx.fillStyle=dim;
            ctx.fillRect(lamp.x-extent,lamp.y-extent,extent*2,extent*2);

            ctx.globalCompositeOperation='screen';
            const radius=lamp.radius*3.1;
            const halo=ctx.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,radius);
            halo.addColorStop(0,'rgba(255,103,31,0.76)');
            halo.addColorStop(.30,'rgba(250,54,14,0.24)');
            halo.addColorStop(1,'rgba(235,54,16,0)');
            ctx.globalAlpha=lamp.power;
            ctx.fillStyle=halo;
            ctx.fillRect(lamp.x-radius,lamp.y-radius,radius*2,radius*2);

            const core=ctx.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,lamp.radius);
            core.addColorStop(0,`rgba(255,${Math.round(153+lamp.colour*91)},${Math.round(83+lamp.colour*77)},0.98)`);
            core.addColorStop(.38,'rgba(255,120,38,0.86)');
            core.addColorStop(1,'rgba(230,48,12,0)');
            ctx.fillStyle=core;
            ctx.globalAlpha=lamp.power;
            ctx.fillRect(lamp.x-lamp.radius,lamp.y-lamp.radius,lamp.radius*2,lamp.radius*2);
        }
        ctx.globalCompositeOperation='screen';
        ctx.lineCap='round';
        for(const trace of sample.traces){
            if(trace.alpha<.01)continue;
            ctx.beginPath();ctx.moveTo(...trace.from);ctx.lineTo(...trace.to);
            ctx.strokeStyle='rgba(238,92,24,0.32)';
            ctx.globalAlpha=trace.alpha*.46;
            ctx.lineWidth=trace.width*2.8;ctx.stroke();
            ctx.strokeStyle='rgba(255,181,78,0.80)';
            ctx.globalAlpha=trace.alpha*.70;
            ctx.lineWidth=trace.width;ctx.stroke();
        }
        ctx.restore();
    }
    return {render,getDiagnostics};
}
