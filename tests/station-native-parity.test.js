import Cairo from 'cairo';import Gio from 'gi://Gio';import GLib from 'gi://GLib';
import {createStationRenderer} from '../extension/nightfall@local/station-renderer.js';
import {Model as Industrial} from '../extension/nightfall@local/station-industrial-native.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const r=createStationRenderer(root+'/extension/nightfall@local/assets/station.png',7321);
const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(surface);
if(r.motion.workers.length)throw new Error('Unapproved workers are active');
if(typeof r.drawWorker==='function')throw new Error('Character draw routine retained');
if(r.lighting.state.scanGain)throw new Error('Old hull scan is active');
const initialWindows=r.motion.windows.map(v=>v.value);const initialNeon=r.motion.neonBrightness(0);
const direction=JSON.stringify(r.lighting.state.direction);
for(const target of [0,3,8,16]){
 while(r.time<target-.00001)r.update(Math.min(.1,target-r.time),{},1);
 r.paint(cr,1672,941);surface.writeToPNG(root+'/station-native-current-'+target+'.png');
}
if(initialWindows.every((v,i)=>v===r.motion.windows[i].value))throw new Error('Station window cycle frozen');
if(initialNeon===r.motion.neonBrightness(0))throw new Error('Neon cycle frozen');
if(!Industrial.steamSamples(3,1).length)throw new Error('Steam model empty');
const time=r.time,active=r.motion.activityTime;
r.update(0,{active:true,x:900,y:30},1);r.paint(cr,1672,941);surface.writeToPNG(root+'/station-native-pause-a.png');
r.update(NaN,{},1);r.paint(cr,1672,941);surface.writeToPNG(root+'/station-native-pause-b.png');
if(r.time!==time||r.motion.activityTime!==active)throw new Error('Pause advances clocks');
for(const id of ['night','service','shift']){if(!r.setMode(id,true))throw new Error('Mode failed');r.paint(cr,1672,941);if(JSON.stringify(r.lighting.state.direction)!==direction)throw new Error('Photographic source light changes direction');}
const start=GLib.get_monotonic_time();for(let i=0;i<48;i++){r.update(1/24,{},1);r.paint(cr,1672,941);}
print(JSON.stringify({diagnostics:r.getDiagnostics(),meanMs:(GLib.get_monotonic_time()-start)/48000}));
r.update(0,{},0);r.paint(cr,1672,941);if(r.steamCount!==0)throw new Error('Activity zero still releases steam');
r.destroy();r.destroy();r.update(.1,{},1);r.paint(cr,1672,941);cr.$dispose();surface.finish();
print('Station native latest-scene parity runtime PASS');
