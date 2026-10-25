"""Bake the approved procedural sprites, sky masks and material-aware increments."""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageFilter,ImageChops
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/station-native';D=json.loads(Path('/tmp/station-native-data.json').read_text());W,H=1672,941
for path in OUT.glob('*.rgba'):
 size=(320,192) if path.stem=='nebula' else (96,96)
 Image.frombytes('RGBA',size,path.read_bytes()).save(path.with_suffix('.png'),optimize=True);path.unlink()
def poly(draw,points,color):draw.polygon([tuple(p) for p in points],fill=color)
def stroke(draw,points,width,color):
 points=[tuple(p) for p in points];draw.line(points+[points[0]],fill=color,width=width,joint='curve')
 r=width/2
 for x,y in points:draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
def alphaImage(mask):
 out=Image.new('RGBA',mask.size,(255,255,255,0));out.putalpha(mask);return out
blocked=Image.new('L',(W,H))
for piece in D['hull']:
 part=Image.new('L',(W,H));p=ImageDraw.Draw(part);poly(p,piece['polygon'],255)
 for hole in piece.get('holes',[]):poly(p,hole,0)
 stroke(p,piece['polygon'],24,255)
 for hole in piece.get('holes',[]):stroke(p,hole,24,255)
 blocked=ImageChops.lighter(blocked,part)
p=ImageDraw.Draw(blocked)
for points in D['extraForeground']:poly(p,points,255);stroke(p,points,24,255)
for b in D['beacons']:p.line([(b['x'],b['y']-35),(b['x'],b['y']+43)],fill=255,width=13)
hard=blocked.point(lambda a:255-a);soft=blocked.filter(ImageFilter.GaussianBlur(3)).point(lambda a:255-a)
mask=ImageChops.multiply(hard,soft);alphaImage(mask).save(OUT/'space-mask.png',optimize=True)
blur=mask.filter(ImageFilter.GaussianBlur(28));soft=ImageChops.darker(mask,blur.point(lambda a:round(255*(a/255)**4)));alphaImage(soft).save(OUT/'nebula-mask.png',optimize=True)
photo=Image.open(ROOT/'assets/station.png').convert('RGB');source=photo.load();meta=json.loads((ROOT/'assets/station-relief/lighting.json').read_text())
def materialIncrement(mask,x,y,color,energy):
 out=photo.crop((x,y,x+mask.width,y+mask.height)).convert('RGBA');p=out.load();m=mask.getchannel('A').load()
 def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
 def display(v):return v*12.92 if v<=.0031308 else 1.055*v**(1/2.4)-.055
 for yy in range(out.height):
  for xx in range(out.width):
   rgb=p[xx,yy];values=[]
   for k in range(3):
    value=rgb[k]/255;target=display(min(1,linear(value)*(1+energy*color[k])));values.append(round(max(0,target-value)*255))
   p[xx,yy]=(*values,m[xx,yy])
 return out
for n,weld in enumerate(meta['welds']):
 mask=Image.open(ROOT/'assets/station-relief'/weld['path']).convert('RGBA')
 materialIncrement(mask,weld['x'],weld['y'],[.58,.81,1],4).save(OUT/f'weld-{n}.png',optimize=True)
pools=[]
for i,lamp in enumerate(D['workLights']):
 points=lamp['floorPolygon'];xs,ys=zip(*points);x=math.floor(min(xs)-3);y=math.floor(min(ys)-3);w=math.ceil(max(xs)-x+3);h=math.ceil(max(ys)-y+3)
 polygonMask=Image.new('L',(w,h));poly(ImageDraw.Draw(polygonMask),[(a-x,b-y) for a,b in points],255)
 alpha=Image.new('L',(w,h));p=alpha.load();cx=sum(xs)/len(xs);cy=sum(ys)/len(ys);radius=max(w,h)*.52
 for yy in range(h):
  for xx in range(w):
   if not polygonMask.getpixel((xx,yy)):continue
   u=min(1,math.hypot(xx+x-cx,yy+y-cy)/radius);v=.55+(.23-.55)*u*2 if u<.5 else .23*(1-(u-.5)*2)
   p[xx,yy]=round(v*255)
 file=f'pool-{i}.png';materialIncrement(alphaImage(alpha),x,y,[v/255 for v in lamp['color']],.75).save(OUT/file,optimize=True);pools.append(dict(file=file,x=x,y=y))
(ROOT/'extension/nightfall@local/station-practical-data.js').write_text('export const POOLS = '+json.dumps(pools)+';\n')
print('Station native: 8 steam sprites, nebula, sky masks, material-aware practical/weld maps baked.')
