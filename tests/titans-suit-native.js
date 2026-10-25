import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
import {createSuitEffects} from '../extension/nightfall@local/titans-suit.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const output=root.resolve_relative_path('validation/titans-suit').get_path();
GLib.mkdir_with_parents(output,0o755);
const photo=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('assets/titans.png').get_path());
const effect=createSuitEffects();
for(const time of [0,1,2,4,6]){
    const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941);
    const cr=new Cairo.Context(frame);cr.setSourceSurface(photo,0,0);cr.paint();
    effect.render(new TitansCanvas(cr),time,1);
    frame.writeToPNG(`${output}/frame-${time}.png`);
    const crop=new Cairo.ImageSurface(Cairo.Format.ARGB32,660,1410);
    const cropContext=new Cairo.Context(crop);cropContext.scale(3,3);
    cropContext.setSourceSurface(frame,-80,-350);cropContext.paint();
    crop.writeToPNG(`${output}/crop-${time}.png`);
    cropContext.$dispose();crop.finish();cr.$dispose();frame.finish();
}
photo.finish();
print(JSON.stringify({output,times:[0,1,2,4,6]}));
