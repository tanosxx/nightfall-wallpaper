import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
import {FLOW_ASSET_FILES, drawSmokeFlow} from '../extension/nightfall@local/titans-smoke-flow.js';
const root=Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const base=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path('assets/titans.png').get_path());
const assets=Object.fromEntries(Object.entries(FLOW_ASSET_FILES).map(([key,name])=>{
 const surface=Cairo.ImageSurface.createFromPNG(root.resolve_relative_path(`assets/titans/${name}`).get_path());
 return[key,{surface,width:surface.getWidth(),height:surface.getHeight()}];
}));
const out=root.resolve_relative_path('validation/titans-visibility-smoke-draft').get_path();
for(const t of[0,1,4]){
 const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,1672,941),cr=new Cairo.Context(surface);
 cr.setSourceSurface(base,0,0);cr.paint();
 drawSmokeFlow(new TitansCanvas(cr),assets,t,1);
 surface.writeToPNG(`${out}/flow-only-${t}.png`);cr.$dispose();surface.finish();
}
base.finish();for(const asset of Object.values(assets))asset.surface.finish();
