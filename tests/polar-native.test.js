import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createPolarRenderer} from '../extension/nightfall@local/polar-renderer.js';
const path=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().resolve_relative_path('assets/polar.png').get_path();
const r=createPolarRenderer(path,72819);
const base=Cairo.ImageSurface.createFromPNG(path), layer=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(layer);
const saveLayer=(name,draw)=>{const l=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),c=new Cairo.Context(l);draw(c);l.writeToPNG('/tmp/nightfall-v6-'+name+'.png');c.$dispose();l.finish();};
for(const target of [0,5,15,30]){
 while(r.time<target-.0001)r.update(1/24,{},1);
 r.paint(cr,1672,941);
 const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),ctx=new Cairo.Context(frame);
 ctx.setSourceSurface(base,0,0);ctx.paint();ctx.setSourceSurface(layer,0,0);ctx.paint();frame.writeToPNG('/tmp/nightfall-v6-native-'+target+'.png');ctx.$dispose();frame.finish();
 saveLayer('water-'+target,c=>r.drawWater(c));saveLayer('beacons-'+target,c=>r.drawBeacons(c));saveLayer('stars-'+target,c=>r.drawStars(c));saveLayer('people-'+target,c=>r.drawPeople(c));saveLayer('windows-'+target,c=>r.drawWindows(c));
 print(JSON.stringify({time:r.time,windows:r.windows.length,on:r.windows.filter(w=>w.on).length,people:r.motion.people.map(p=>({x:+p.x.toFixed(2),y:+p.y.toFixed(2),action:p.action}))}));
}
const time=r.time;r.update(0,{},0);r.paint(cr,1672,941);layer.writeToPNG('/tmp/nightfall-v6-pause-a.png');r.update(0,{x:1,active:true},0);r.paint(cr,1672,941);layer.writeToPNG('/tmp/nightfall-v6-pause-b.png');if(r.time!==time)throw new Error('Paused time changed');
const start=GLib.get_monotonic_time();for(let i=0;i<96;i++){r.update(1/24,{},1);r.paint(cr,1672,941);}print('96 frames mean ms: '+((GLib.get_monotonic_time()-start)/96000).toFixed(2));print('Water triangles: '+r.waterRegions.reduce((n,x)=>n+x.triangles.length,0));r.destroy();cr.$dispose();layer.finish();base.finish();print('Native V6 runtime/dispose PASS');
