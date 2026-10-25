#!/usr/bin/env python3
"""Bake the existing browser Cloudcity masks into inexpensive Cairo assets.

Run with Python + Pillow + NumPy. No generated art or scene geometry is changed:
the input is the same photograph, clean cloud plate, masks and circuit schedules
used by the browser renderer. This build step must never run inside GNOME Shell.
"""
import json
import math
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/cloudcity-native'
OUT.mkdir(exist_ok=True)
SOURCE = '''const fs=require('fs'),vm=require('vm'),c={window:{}};vm.createContext(c);
for(const n of ['atmosphere','lights','turbines'])vm.runInContext(fs.readFileSync('cloudcity-'+n+'.js','utf8'),c);
const w=c.window;console.log(JSON.stringify({atmosphere:w.CLOUDCITY_ATMOSPHERE,lights:w.CLOUDCITY_LIGHTS,turbines:w.CLOUDCITY_TURBINES}));'''
data = json.loads(subprocess.check_output(['node', '-e', SOURCE], cwd=ROOT))
A, L, T = data['atmosphere'], data['lights'], data['turbines']
W, H = A['W'], A['H']
original = np.array(Image.open(ROOT / 'assets/cloudcity.png').convert('RGB'))
fill = np.array(Image.open(ROOT / 'assets/cloudcity-cloud-plate.png').convert('RGB'), dtype=np.float32)

def smooth(x):
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)

def mask_polygon(points, value, target):
    ImageDraw.Draw(target).polygon([tuple(p) for p in points], fill=value)

# The original plate is immutable behind buildings, rails and the lower left.
mask_image = Image.new('L', (W, H), 0)
mask_polygon(A['sea'], 255, mask_image)
for points in A['buildings'] + A['foregroundShapes']:
    mask_polygon(points, 0, mask_image)
draw = ImageDraw.Draw(mask_image)
for p, q, width in A['rails']:
    radius = (width+2)/2
    draw.line([tuple(p),tuple(q)], fill=0, width=width+2)
    for x,y in [p,q]: draw.ellipse((x-radius,y-radius,x+radius,y+radius), fill=0)
distance = np.where(np.asarray(mask_image)>128, 9999., 0.).astype(np.float32)
# Match the browser's forward/backward chamfer distances; this is build time.
for y in range(H):
    for x in range(W):
        if distance[y,x]:
            distance[y,x] = min(distance[y,x], distance[y,x-1]+1 if x else 0,
                distance[y-1,x]+1 if y else 0, distance[y-1,x-1]+1.414 if x and y else 9999)
for y in range(H-1,-1,-1):
    for x in range(W-1,-1,-1):
        if distance[y,x]:
            distance[y,x] = min(distance[y,x], distance[y,x+1]+1 if x<W-1 else 0,
                distance[y+1,x]+1 if y<H-1 else 0, distance[y+1,x+1]+1.414 if x<W-1 and y<H-1 else 9999)
yy,xx=np.mgrid[:H,:W]
coverage = smooth(distance/2)
for base in A['mistBases']:
    index,min_y,feather=base['index'],base['minY'],base['feather']
    points=A['buildings'][index]
    for p,q in zip(points, points[1:]+points[:1]):
        if min(p[1],q[1])<min_y: continue
        left=max(0,int(min(p[0],q[0])-feather));right=min(W,int(max(p[0],q[0])+feather+1))
        top=max(0,int(min(p[1],q[1])-feather));bottom=min(H,int(max(p[1],q[1])+feather+1))
        xs=xx[top:bottom,left:right];ys=yy[top:bottom,left:right]
        dx=q[0]-p[0];dy=q[1]-p[1]
        t=np.clip(((xs-p[0])*dx+(ys-p[1])*dy)/(dx*dx+dy*dy or 1),0,1)
        f=smooth(np.hypot(xs-p[0]-t*dx,ys-p[1]-t*dy)/feather)
        coverage[top:bottom,left:right]=np.minimum(coverage[top:bottom,left:right], f)
coverage *= 1-(1-smooth((xx-650)/200))*smooth((yy-420)/50)
coverage *= smooth((yy-331)/59)
rgba=np.full((H,W,4),255,dtype=np.uint8);rgba[:,:,3]=np.round(coverage*255).astype(np.uint8)
Image.fromarray(rgba).save(OUT/'cloud-mask.png')

gains=np.ones((H,3));colors=np.repeat([[105.,124.,151.]],H,axis=0)
for y in range(330,H):
    use=distance[y,::3]>40
    if np.count_nonzero(use)>20:
        a=original[y,::3][use].mean(axis=0);b=fill[y,::3][use].mean(axis=0)
        gains[y]=np.clip(a/np.maximum(1,b),.55,1.35);colors[y]=a
    elif y>330:gains[y]=gains[y-1];colors[y]=colors[y-1]
weights=smooth((distance-10)/38)
for y in range(H):
    gain=gains[max(0,y-24):min(H,y+25)].mean(axis=0)
    color=colors[max(0,y-24):min(H,y+25)].mean(axis=0)
    rgb=fill[y]*gain
    luminance=rgb@np.array([.2126,.7152,.0722]);reference=color@np.array([.2126,.7152,.0722])
    matched=(reference+(luminance-reference)*.78)[:,None]*color/max(1,reference)
    corrected=rgb*.22+matched*.78
    fill[y]=original[y]*weights[y,:,None]+corrected*(1-weights[y,:,None])
restored=np.clip(np.round(fill),0,255).astype(np.uint8)
Image.fromarray(np.concatenate([restored,restored[:,::-1]],axis=1)).save(OUT/'cloud-strip.png')

# Extract source emission pixels into small independently paintable sprites.
r,g,b=[original[:,:,i].astype(float) for i in range(3)]
warm=np.maximum(smooth((r-b-9)/27)*smooth((g-b-2)/20)*smooth((r-43)/75),
    smooth((np.minimum(np.minimum(r,g),b)-165)/65)*smooth((r-b+12)/12)*smooth((g-b+10)/10))
warm[(r<g-5)|(g<r*.44)]=0
used=np.zeros((H,W),dtype=bool);circuits=[];patches=[]
def add_patch(points,id,seed,room=None):
    ys=np.array([p[0] for p in points]);xs=np.array([p[1] for p in points]);left=int(xs.min());top=int(ys.min())
    width=int(xs.max())-left+1;height=int(ys.max())-top+1
    off=np.zeros((height,width,4),dtype=np.uint8);on=off.copy()
    source=original[ys,xs].astype(float);alpha=255*np.power(warm[ys,xs],.4)
    off[ys-top,xs-left,:3]=np.clip(source*[.16,.19,.23]+[8,14,22],0,255).astype(np.uint8)
    on[ys-top,xs-left,:3]=np.minimum([255,235,185],source*[1.5,1.32,1.14]+[13,9,4]).astype(np.uint8)
    off[ys-top,xs-left,3]=alpha.astype(np.uint8);on[:,:,3]=off[:,:,3]
    used[ys,xs]=True
    circuits.append(dict(id=id,x=left,y=top,w=width,h=height,pixels=len(points),seed=seed,room=room,relight=bool(source[:,0].mean()<151)))
    patches.append((Image.fromarray(off),Image.fromarray(on)))
for zi,zone in enumerate(L['rooms']+L['facades']):
    room=zone if zi<len(L['rooms']) else None
    poly=Image.new('L',(W,H));mask_polygon(zone['polygon'],255,poly)
    active=(np.asarray(poly)>0)&(warm>.045)&~used
    ys,xs=np.nonzero(active)
    if not len(xs):continue
    if room:add_patch(list(zip(ys,xs)),room['id'],zi*137+71,room);continue
    count=0
    for y,x in zip(ys,xs):
        if not active[y,x]:continue
        queue=[(y,x)];active[y,x]=False
        for py,px in queue:
            for dy in [-1,0,1]:
                for dx in [-1,0,1]:
                    yy0,xx0=py+dy,px+dx
                    if 0<=yy0<H and 0<=xx0<W and active[yy0,xx0]:active[yy0,xx0]=False;queue.append((yy0,xx0))
        if len(queue)>=2:add_patch(queue,f"{zone['id']}-{count}",zi*137+count*29+71);count+=1
atlas_width=512;ax=ay=2;row_h=0
for circuit in circuits:
    if ax+circuit['w']+2>atlas_width:ax=2;ay+=row_h+2;row_h=0
    circuit['atlasX']=ax;circuit['atlasY']=ay;ax+=circuit['w']+2;row_h=max(row_h,circuit['h'])
off=Image.new('RGBA',(atlas_width,ay+row_h+2));on=Image.new('RGBA',off.size)
for circuit,(dark,bright) in zip(circuits,patches):
    pos=(circuit['atlasX'],circuit['atlasY']);off.paste(dark,pos);on.paste(bright,pos)
off.save(OUT/'windows-dark.png');on.save(OUT/'windows-bright.png')

red_atlas=Image.new('RGBA',(512,128));ax=ay=2;row_h=0
for beacon in L['beacons']:
    radius=math.ceil(8*beacon['scale']+2);x=max(0,round(beacon['x'])-radius);y=max(0,round(beacon['y'])-radius)
    w=min(W-x,2*radius+1);h=min(H-y,2*radius+1)
    pr,pg,pb=[original[y:y+h,x:x+w,i].astype(float) for i in range(3)]
    py,px=np.mgrid[y:y+h,x:x+w];distance_b=np.hypot(px-beacon['x'],py-beacon['y'])
    red=np.clip((pr-pg-18)/42,0,1)*np.clip((pr*.78-pg)/28,0,1)*np.clip((pr-pb-10)/27,0,1)*np.clip((pb-pg*.62+3)/15,0,1)*smooth((6*beacon['scale']+2-distance_b)/2)
    patch=np.zeros((h,w,4),dtype=np.uint8);patch[:,:,0]=10+pr*.1;patch[:,:,1]=13+pg*.1;patch[:,:,2]=19+pb*.12;patch[:,:,3]=red*255
    if ax+w+2>512:ax=2;ay+=row_h+2;row_h=0
    red_atlas.paste(Image.fromarray(patch),(ax,ay));beacon['mask']=dict(x=x,y=y,w=w,h=h,atlasX=ax,atlasY=ay)
    ax+=w+2;row_h=max(row_h,h)
red_atlas.crop((0,0,512,ay+row_h+2)).save(OUT/'beacons-dark.png')

photo=Image.fromarray(original)
for index,rotor in enumerate(T['rotors']):
    size=rotor['size'];half=size/2;rx=rotor['rx'];ry=rotor['ry'];shear=rotor['shear']
    sprite=photo.transform((size,size),Image.Transform.AFFINE,
        (rx/half,shear/half,rotor['cx']-rx-shear,0,ry/half,rotor['cy']-ry),Image.Resampling.BICUBIC).convert('RGBA')
    py,px=np.mgrid[:size,:size];radius=np.hypot((px+.5-half)/half,(py+.5-half)/half)
    alpha=np.clip((radius-.292)/(.65/ry),0,1)*np.clip((1-radius)/(.8/ry),0,1)
    sprite.putalpha(Image.fromarray(np.round(alpha*255).astype(np.uint8)));sprite.save(OUT/f'rotor-{index}.png')
    hub=rotor['hub'];hrx=hub['rx']+1;hry=hub['ry']+1;hw=math.ceil(hrx*2);hh=math.ceil(hry*2)
    sprite=photo.transform((hw,hh),Image.Transform.AFFINE,(1,0,hub['cx']-hrx,0,1,hub['cy']-hry),Image.Resampling.BICUBIC).convert('RGBA')
    py,px=np.mgrid[:hh,:hw];rad=np.hypot((px+.5-hrx)/hub['rx'],(py+.5-hry)/hub['ry'])
    sprite.putalpha(Image.fromarray(np.round(255*np.clip((1-rad)*min(hub['rx'],hub['ry'])/.65,0,1)).astype(np.uint8)))
    sprite.save(OUT/f'hub-{index}.png');rotor['hubX']=hub['cx']-hrx;rotor['hubY']=hub['cy']-hry

result=dict(width=W,height=H,cloudSpeed=A['motion']['speed'],cloudStripWidth=W*2,circuits=circuits,beacons=L['beacons'],rotors=T['rotors'],stormEvents=A['stormEvents'])
(ROOT/'extension/nightfall@local/cloudcity-native-data.js').write_text('// Generated by scripts/build-cloudcity-native-assets.py from the browser scene.\nexport const CLOUDCITY = '+json.dumps(result,separators=(',',':'))+';\n')
print(json.dumps(dict(circuits=len(circuits),beacons=len(L['beacons']),rotors=len(T['rotors']),assets=[p.name for p in OUT.glob('*.png')],emissionPixels=sum(c['pixels'] for c in circuits))))
