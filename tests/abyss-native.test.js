import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createAbyssRenderer} from '../extension/nightfall@local/abyss-renderer.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const renderer=createAbyssRenderer(root+'/extension/nightfall@local/assets/abyss.png');
const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(surface);
for (const target of [0,5,15,30]) {
    while (renderer.time<target-.00001) renderer.update(Math.min(.1,target-renderer.time),{},.7);
    renderer.paint(cr,1672,941);surface.writeToPNG(root+'/abyss-native-'+target+'.png');
}
const before=JSON.stringify(renderer.getDiagnostics());
renderer.update(0,{x:1,y:1,active:true},.7);renderer.paint(cr,1672,941);surface.writeToPNG(root+'/abyss-native-pause-a.png');
renderer.update(NaN,{},.7);renderer.paint(cr,1672,941);surface.writeToPNG(root+'/abyss-native-pause-b.png');
if (before!==JSON.stringify(renderer.getDiagnostics())) throw new Error('Paused clocks changed');
renderer.update(-5,{},-1);if(renderer.weather!==0)throw new Error('Weather minimum');
renderer.update(0,{},5);if(renderer.weather!==1)throw new Error('Weather maximum');
const time=renderer.time,water=renderer.waterTime;renderer.update(.1,{},0);
if (Math.abs(renderer.waterTime-water-.035)>1e-7)throw new Error('Low current clock');
const start=GLib.get_monotonic_time();
for(let i=0;i<48;i++){renderer.update(1/24,{},.7);renderer.paint(cr,1672,941);}
print(JSON.stringify({diagnostics:renderer.getDiagnostics(),meanMs:(GLib.get_monotonic_time()-start)/48000}));
renderer.paint(cr,960,1080);
renderer.destroy();renderer.destroy();renderer.update(.1,{},1);renderer.paint(cr,1672,941);
if(renderer.surfaces.length||renderer.contexts.length)throw new Error('Surface/context cache retained');
cr.$dispose();surface.finish();print('Abyss native runtime, pause, weather, aspect ratio and dispose PASS');
