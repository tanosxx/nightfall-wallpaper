import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Data from '../extension/nightfall@local/station-data.js';
import {createStationRenderer} from '../extension/nightfall@local/station-renderer.js';
import {SCENES,createRenderer} from '../extension/nightfall@local/scene-registry.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const path=root.resolve_relative_path('assets/station.png').get_path();
const extensionPath=root.resolve_relative_path('extension/nightfall@local').get_path();
const base=Cairo.ImageSurface.createFromPNG(path),layer=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(layer);
for(const scene of SCENES){const test=await createRenderer(scene.id,extensionPath);test.update(0,{},1);test.paint(cr,1672,941);test.update(1/24,{},1);test.paint(cr,1672,941);test.destroy();print('Registry real GJS smoke PASS: '+scene.id);}
const r=createStationRenderer(path,72819);
function saveFrame(tag){r.paint(cr,1672,941);const frame=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),p=new Cairo.Context(frame);p.setSourceSurface(base,0,0);p.paint();p.setSourceSurface(layer,0,0);p.paint();frame.writeToPNG('/tmp/nightfall-v10-station-'+tag+'.png');p.$dispose();frame.finish();}
function saveLayer(name,draw){const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),p=new Cairo.Context(surface);draw(p);surface.writeToPNG('/tmp/nightfall-v10-'+name+'.png');p.$dispose();surface.finish();}
for(const target of [0,5,15,30]){while(r.time<target-.00001)r.update(1/24,{},1);saveFrame(target);saveLayer('lights-'+target,c=>r.drawWindows(c));saveLayer('beacons-'+target,c=>r.drawBeacons(c));saveLayer('hangar-'+target,c=>r.drawHangar(c));saveLayer('workers-'+target,c=>r.motion.workers.forEach(a=>r.drawWorker(c,a)));print(JSON.stringify({time:r.time,workers:r.motion.workers.length,welders:r.motion.welders.filter(w=>w.active).length,windowsOn:r.motion.windows.filter(w=>w.on).length}));}
const time=r.time;saveFrame('pause-a');r.update(0,{x:1,active:true},1);saveFrame('pause-b');if(r.time!==time)throw new Error('Time changed while paused');
r.update(0,{},0);r.paint(cr,1672,941);saveLayer('break-a',c=>r.drawHangar(c));const activity=r.motion.activityTime;for(let i=0;i<120;i++)r.update(1/24,{},0);saveLayer('break-b',c=>r.drawHangar(c));if(r.motion.activityTime!==activity)throw new Error('Activity progressed during break');
r.update(0,{},1);
let caught=false;for(let i=0;i<240&&!caught;i++){r.update(1/24,{},1);if(r.motion.welders.some(w=>w.brightness>.5&&w.sparks.length)){saveFrame('welding');saveLayer('welding',c=>r.motion.welders.forEach(w=>r.drawWelding(c,w)));caught=true;}}if(!caught)throw new Error('No welding event');
for(const mode of ['shift','night','service']){r.setMode(mode,true);r.update(0,{},1);saveFrame(mode);if(mode==='night'){r.relitPlate.writeToPNG('/tmp/nightfall-v10-night-plate.png');r.occluders.writeToPNG('/tmp/nightfall-v10-night-occluders.png');}}
r.setMode('night',true);saveFrame('night-pause-a');r.update(0,{},1);saveFrame('night-pause-b');
r.setMode('service',true);r.motion.welders.forEach(w=>w.brightness=0);r.lightDirty=true;r.rebuildLighting();r.relitPlate.writeToPNG('/tmp/nightfall-v10-relief-weld-off.png');
r.motion.welders[0].brightness=1;r.lightDirty=true;r.rebuildLighting();r.relitPlate.writeToPNG('/tmp/nightfall-v10-relief-weld-on.png');
r.motion.welders.forEach(w=>w.brightness=0);r.rebuildLighting();r.relitPlate.writeToPNG('/tmp/nightfall-v10-scan-a.png');for(let i=0;i<20;i++)r.lighting.update(.1);r.rebuildLighting();r.relitPlate.writeToPNG('/tmp/nightfall-v10-scan-b.png');
r.update(1/24,{},1);
const start=GLib.get_monotonic_time();for(let i=0;i<96;i++){r.update(1/24,{},1);r.paint(cr,1672,941);}print('96 complete frames ms: '+((GLib.get_monotonic_time()-start)/96000).toFixed(2));
// Compare a worker hidden behind the parked freighter to the same empty area.
const actors={workers:r.motion.workers,welders:r.motion.welders};r.motion.workers=[];r.motion.welders=[];
saveFrame('no-actors');
const hull=Data.HANGAR.occluders.find(o=>o.id.includes('ship'))??Data.HANGAR.occluders[0];
const center=hull.polygon.reduce((a,p)=>[a[0]+p[0]/hull.polygon.length,a[1]+p[1]/hull.polygon.length],[0,0]);
const forced={id:'test',x:center[0],y:center[1]+2,height:5,color:[150,120,80],heading:1,stride:0,phase:0,armPhase:0,working:false};
r.motion.workers=[forced];saveFrame('behind-freighter');saveLayer('forced-worker',c=>r.drawWorker(c,forced));
r.motion.workers=actors.workers;r.motion.welders=actors.welders;
if('ships' in r.motion||'robots' in r.motion)throw new Error('Ships or robots still present');
r.destroy();cr.$dispose();layer.finish();base.finish();print('Station real GJS/Cairo runtime+dispose PASS');
