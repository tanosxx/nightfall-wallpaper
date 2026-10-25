import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
import {createLeftSmokeEffects} from '../extension/nightfall@local/titans-left-smoke.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const owned=[];
const surface=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('assets/titans/left-cloud-flow.png').get_path());
const effects=createLeftSmokeEffects({leftSmokeFlow:{surface,width:surface.getWidth(),height:surface.getHeight(),crops:new Map(),ownedSurfaces:owned}});
const photo=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('assets/titans.png').get_path());
for(const time of [0,1,2,3,4,6,8,12,16,20,24,28,32,36,40,44,47.99,48]) {
    const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(frame);
    cr.setSourceSurface(photo,0,0);cr.paint();
    effects.render(new TitansCanvas(cr),time,1);
    frame.writeToPNG(`/tmp/titans-left-smoke-${time}.png`);
    cr.$dispose();frame.finish();
}
const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(frame);
const start=GLib.get_monotonic_time();
for(let i=0;i<96;i++) effects.render(new TitansCanvas(cr),i/2,1);
print(JSON.stringify({msPerFrame:(GLib.get_monotonic_time()-start)/96000,cachedSurfaces:owned.length,diagnostics:effects.getDiagnostics(2,1)}));
cr.$dispose();frame.finish();photo.finish();surface.finish();for(const cached of owned)cached.finish();
