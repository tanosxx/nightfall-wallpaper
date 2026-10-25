import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {createTitansRenderer} from '../extension/nightfall@local/titans-renderer.js';
const folder=GLib.dir_make_tmp('nightfall-titans-video-XXXXXX');
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const path=root.resolve_relative_path('assets/titans.png').get_path();
const renderer=createTitansRenderer(path);
const base=Cairo.ImageSurface.createFromPNG(path), layer=new Cairo.ImageSurface(Cairo.Format.ARGB32,1280,720), final=new Cairo.ImageSurface(Cairo.Format.ARGB32,1280,720);
const lc=new Cairo.Context(layer), fc=new Cairo.Context(final);
const scale=Math.max(1280/1672,720/941);
let maxResources=0;
try {
 for(let i=0;i<288;i++)renderer.update(1/24,{},1);
 for(let frame=0;frame<192;frame++){
  renderer.paint(lc,1280,720);
  fc.save();fc.setOperator(Cairo.Operator.SOURCE);fc.translate((1280-1672*scale)/2,(720-941*scale)/2);fc.scale(scale,scale);fc.setSourceSurface(base,0,0);fc.paint();fc.restore();
  fc.setOperator(Cairo.Operator.OVER);fc.setSourceSurface(layer,0,0);fc.paint();
  final.writeToPNG(`${folder}/frame-${String(frame).padStart(4,'0')}.png`);
  maxResources=Math.max(maxResources,renderer.getDiagnostics().assets);
  renderer.update(1/24,{},1);
 }
 renderer.destroy();
 print(JSON.stringify({folder,frames:192,width:1280,height:720,fps:24,startTime:12,duration:8,maxOwnedSurfaces:maxResources,remainingOwnedSurfaces:renderer.getDiagnostics().assets}));
}finally{renderer.destroy();lc.$dispose();fc.$dispose();base.finish();layer.finish();final.finish();}
