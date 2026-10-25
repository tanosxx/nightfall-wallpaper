/* Native photographic sky masks keep moving dust behind all fixed station parts. */
import Cairo from 'cairo';
import {Model} from './station-space-model.js';
import {StationCanvas} from './station-canvas.js';
const W=1672,H=941,TAU=Math.PI*2,wrap=(x,n)=>((x%n)+n)%n;
export function createStationSpace(assetPath){
    const mask=Cairo.ImageSurface.createFromPNG(assetPath+'/space-mask.png');
    const diffuse=Cairo.ImageSurface.createFromPNG(assetPath+'/nebula-mask.png');
    const veil=Cairo.ImageSurface.createFromPNG(assetPath+'/nebula.png');
    const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,W,H),cr=new Cairo.Context(surface);
    const glow=new Cairo.ImageSurface(Cairo.Format.ARGB32,32,32),p=new Cairo.Context(glow);
    const gradient=new Cairo.RadialGradient(16,16,0,16,16,16);
    gradient.addColorStopRGBA(0,207/255,222/255,246/255,.85);gradient.addColorStopRGBA(.18,136/255,170/255,218/255,.2);gradient.addColorStopRGBA(1,90/255,130/255,190/255,0);
    p.setSource(gradient);p.paint();p.$dispose();
    const nebula=new Cairo.ImageSurface(Cairo.Format.ARGB32,W,H),n=new Cairo.Context(nebula);
    let nebulaTime=-Infinity,destroyed=false;
    return {mask,render(target,t){
        if(destroyed)return;
        cr.setOperator(Cairo.Operator.CLEAR);cr.paint();cr.setOperator(Cairo.Operator.OVER);
        // A cached 12 Hz veil preserves its very slow drift while dust remains
        // at the compositor's frame rate. Paused renders never rebuild it.
        if(t-nebulaTime>=1/12 || t<nebulaTime){
            n.setOperator(Cairo.Operator.CLEAR);n.paint();n.setOperator(Cairo.Operator.OVER);
            const veilCanvas=new StationCanvas(n),upper=wrap(t*3.1,1250),lower=wrap(-t*1.4,1000);
            for(let tile=-1;tile<2;tile++){
                veilCanvas.globalAlpha=.30;veilCanvas.drawImage(veil,tile*1250+upper,-220,1250,620);
                veilCanvas.globalAlpha=.18;veilCanvas.drawImage(veil,tile*1000+lower,700,1000,400);
            }
            n.setOperator(Cairo.Operator.DEST_IN);n.setSourceSurface(diffuse,0,0);n.paint();n.setOperator(Cairo.Operator.OVER);
            nebulaTime=t;
        }
        cr.setSourceSurface(nebula,0,0);cr.paint();
        const ctx=new StationCanvas(cr);
        const current=Model.sample(t);
        for(const particle of current){
            if(particle.alpha<=0)continue;
            if(particle.near){ctx.globalAlpha=particle.alpha*.2;ctx.drawImage(glow,particle.x-3.5,particle.y-3.5,7,7);}
            cr.setSourceRGBA(205/255,221/255,242/255,Math.min(1,particle.alpha+particle.flash*.36));
            cr.newPath();cr.arc(particle.x,particle.y,particle.radius+particle.flash*.24,0,TAU);cr.fill();
            if(particle.flash>.01){ctx.globalAlpha=particle.flash*.8;ctx.drawImage(glow,particle.x-5,particle.y-5,10,10);}
        }
        cr.setOperator(Cairo.Operator.DEST_IN);cr.setSourceSurface(mask,0,0);cr.paint();cr.setOperator(Cairo.Operator.OVER);
        target.save();target.setOperator(Cairo.Operator.SCREEN);target.setSourceSurface(surface,0,0);target.paint();target.restore();
        return current;
    },destroy(){if(destroyed)return;destroyed=true;cr.$dispose();n.$dispose();for(const s of [mask,diffuse,veil,surface,glow,nebula])s.finish();}};
}
