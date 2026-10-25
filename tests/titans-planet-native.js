import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
import {PLANET_ASSET_FILES,createPlanetEffects} from '../extension/nightfall@local/titans-planet-blasts.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const output=root.resolve_relative_path('validation/titans-planet').get_path();
GLib.mkdir_with_parents(output,0o755);
const owned=[];
const photo=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('assets/titans.png').get_path());
const assets=Object.fromEntries(Object.entries(PLANET_ASSET_FILES).map(([key,name])=>{
    const surface=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path(`assets/titans/${name}`).get_path());
    owned.push(surface);
    return [key,{surface,width:surface.getWidth(),height:surface.getHeight(),crops:new Map(),ownedSurfaces:owned}];
}));
const effects=createPlanetEffects(assets);
for(const time of [0,1,3,6,10,15,26,36]){
    const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941);
    const cr=new Cairo.Context(frame);
    cr.setSourceSurface(photo,0,0);cr.paint();
    effects.render(new TitansCanvas(cr),time,1);
    frame.writeToPNG(`${output}/frame-${time}.png`);
    cr.$dispose();frame.finish();
}
for(const surface of owned)surface.finish();photo.finish();
print(JSON.stringify({output,times:[0,1,3,6,10,15,26,36]}));
