import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
import {GROUND_ASSET_FILES,createGroundEffects} from '../extension/nightfall@local/titans-ground.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const assets={},surfaces=[];
for(const[key,name]of Object.entries(GROUND_ASSET_FILES)){
 const surface=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path(`assets/titans/${name}`).get_path());
 surfaces.push(surface);assets[key]={surface,width:surface.getWidth(),height:surface.getHeight()};
}
const effect=createGroundEffects(assets);
const photo=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('concepts/fallen-titans-v1.png').get_path());
for(const t of[0,6,20]){
 const target=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(target);
 cr.setSourceSurface(photo,0,0);cr.paint();effect.render(new TitansCanvas(cr),t,1);
 target.writeToPNG(`/tmp/titans-ground-${t}.png`);cr.$dispose();target.finish();
}
const target=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(target);
const start=GLib.get_monotonic_time();
for(let i=0;i<48;i++){
 cr.setOperator(Cairo.Operator.CLEAR);cr.paint();cr.setOperator(Cairo.Operator.OVER);
 effect.render(new TitansCanvas(cr),i/24,1);
}
print(`Ground render ${(GLib.get_monotonic_time()-start)/48000}ms/frame`);
cr.$dispose();target.finish();photo.finish();for(const s of surfaces)s.finish();
