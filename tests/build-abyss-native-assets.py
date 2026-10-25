"""Bake source-aligned light residuals and glass masks for the native Cairo port.
Run node tests/build-abyss-native-models.cjs first. No generative image edits.
"""
import json, math
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
D=json.loads(Path('/tmp/abyss-native-data.json').read_text())
OUT=ROOT/'assets/abyss-native';OUT.mkdir(exist_ok=True)
photo=Image.open(ROOT/'assets/abyss.png').convert('RGB');W,H=photo.size
source=photo.load(); blurred=photo.filter(ImageFilter.GaussianBlur(9)).load()
def clamp(v,a=0,b=1):return max(a,min(b,v))
def smooth(v):v=clamp(v);return v*v*(3-2*v)
def luma(rgb):return sum(v*w for v,w in zip(rgb,[.2126,.7152,.0722]))
def bounds(points):
 xs,ys=zip(*points);return [math.floor(min(xs)),math.floor(min(ys)),math.ceil(max(xs)-min(xs))+1,math.ceil(max(ys)-min(ys))+1]
def coverage(points,x,y,feather=1.1):
 inside=False;distance=1e9
 for a,b in zip(points[-1:]+points[:-1],points):
  dx,dy=b[0]-a[0],b[1]-a[1]
  if (a[1]>y)!=(b[1]>y) and x<dx*(y-a[1])/dy+a[0]:inside=not inside
  t=clamp(((x-a[0])*dx+(y-a[1])*dy)/max(1e-12,dx*dx+dy*dy))
  distance=min(distance,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
 return smooth(distance/feather) if inside else 0
emitters=[];totals={}
def add(kind,index,b,compute):
 x,y,w,h=b;x=max(0,x);y=max(0,y);w=min(w,W-x);h=min(h,H-y)
 im=Image.new('RGB',(w,h));pixels=im.load()
 for yy in range(h):
  for xx in range(w):
   X,Y=x+xx,y+yy;rgb=source[X,Y];values=compute(X,Y,rgb)
   amount=tuple(int(clamp(v,0,rgb[c])+.5) for c,v in enumerate(values));pixels[xx,yy]=amount
   key=(X,Y);total=totals.setdefault(key,[0,0,0])
   for c in range(3):total[c]+=amount[c]
 emitters.append(dict(kind=kind,index=index,x=x,y=y,w=w,h=h,im=im))
for i,f in enumerate(D['lighting']['windows']):
 add('windows',i,bounds(f['points']),lambda x,y,rgb,f=f:[v*a*coverage(f['points'],x+.5,y+.5) for v,a in zip(rgb,[.76,.73,.68])])
for i,f in enumerate(D['lighting']['worklamps']):
 beam=f['beam'];x=math.floor(min(f['x']-beam['width']*1.35,beam['endX']-beam['width']*1.3));y=math.floor(f['y']+3)
 b=[x,y,math.ceil(max(f['x']+beam['width']*1.35,beam['endX']+beam['width']*1.3)-x),math.ceil(beam['endY']-f['y']+12)]
 profile=[]
 for row in range(b[3]):
  Y=y+row;t=clamp((Y-f['y'])/(beam['endY']-f['y']));center=f['x']+(beam['endX']-f['x'])*t;radius=f['rx']+17+(beam['width']-f['rx']+14)*math.sqrt(t)
  sides=[blurred[round(clamp(center+sign*(radius+10),0,W-1)),int(clamp(Y,0,H-1))] for sign in [-1,1]]
  weights=[math.exp(-max(0,s[0]-s[2]-4)/13)/(18+luma(s)) for s in sides]
  profile.append([sum(s[c]*w for s,w in zip(sides,weights))/sum(weights) for c in range(3)])
 weights=[math.exp(-k*k/(2*13*13)) for k in range(-28,29)];total=sum(weights)
 ambient=[[sum(profile[int(clamp(row+k,0,b[3]-1))][c]*w for k,w in zip(range(-28,29),weights))/total for c in range(3)] for row in range(b[3])]
 def beamResidual(X,Y,rgb):
  t=clamp((Y-f['y'])/(beam['endY']-f['y']));center=f['x']+(beam['endX']-f['x'])*t
  radius=f['rx']+17+(beam['width']-f['rx']+14)*math.sqrt(t)
  support=1-smooth((abs(X-center)/radius-.65)/.55);vertical=smooth((Y-f['y']-2)/5)*(1-smooth((t-.88)/.18));cold=1-smooth((rgb[0]-rgb[2]-6)/24)
  low=blurred[X,Y];side=ambient[Y-b[1]]
  return [min(v*.80,max(0,low[c]-max(side[c],low[c]*.20,[6,13,19][c])))*support*vertical*cold for c,v in enumerate(rgb)]
 add('worklamps',i,b,beamResidual)
 core=[math.floor(f['x']-f['rx']-4),math.floor(f['y']-f['ry']-4),math.ceil(f['rx']*2+9),math.ceil(f['ry']*2+9)]
 def coreResidual(x,y,rgb):
  mask=math.exp(-(((x-f['x'])/(f['rx']+3))**4+((y-f['y'])/(f['ry']+2))**4))*smooth((min(rgb)-48)/105)
  return [max(0,v-[13,20,25][c])*mask for c,v in enumerate(rgb)]
 add('worklamps',i,core,coreResidual)
for i,f in enumerate(D['practicals']['lamps']):
 radius=f.get('halo',9);rx=max(f.get('rx',1.5),1);ry=max(f.get('ry',1.5),1);b=[math.floor(f['x']-radius),math.floor(f['y']-radius),math.ceil(radius*2+1),math.ceil(radius*2+1)]
 def amber(X,Y,rgb):
  r,g,blue=rgb;warm=max(smooth((r-blue-3)/32),smooth((min(rgb)-125)/90))*smooth((r-28)/75)
  edge=smooth(min(X-b[0]+.5,b[0]+b[2]-X-.5,Y-b[1]+.5,b[1]+b[3]-Y-.5)/1.2)
  ambient=max(16,min(27,blue*.24));target=[ambient*.85,ambient,ambient*1.12]
  halo=math.exp(-(math.hypot(X-f['x'],Y-f['y'])/(radius*.53))**2)
  core=math.exp(-((X-f['x'])/(rx+1))**4-((Y-f['y'])/(ry+1))**4)
  return [max(0,v-target[c])*warm*edge*max(core,halo*.85) for c,v in enumerate(rgb)]
 add('amber',i,b,amber)
 if 'beam' in f:
  beam=f['beam'];extent=beam['width']*1.4
  b=[math.floor(min(f['x'],beam['endX'])-extent),math.floor(f['y']+2),math.ceil(abs(beam['endX']-f['x'])+extent*2),math.ceil(beam['endY']-f['y']+15)]
  def surface(X,Y,rgb):
   t=clamp((Y-f['y'])/(beam['endY']-f['y']));center=f['x']+(beam['endX']-f['x'])*t;radius=f['rx']+6+(beam['width']-f['rx'])*math.sqrt(t)
   support=math.exp(-(abs(X-center)/(radius*.78))**4);vertical=smooth((Y-f['y']-1)/4)*(1-smooth((t-.68)/.36));low=blurred[X,Y];warm=smooth((low[0]-low[2]-2)/25)
   receiver=coverage(beam['points'],X+.5,Y+.5,6) if 'points' in beam else 1
   return [min(v*.78,max(0,low[c]-[18,24,29][c]))*support*vertical*warm*receiver for c,v in enumerate(rgb)]
  add('amber',i,b,surface)
for i,f in enumerate(D['lighting']['beacons']):
 def red(x,y,rgb):
  r,g,b=rgb;mask=smooth((r-max(g,b)-3)/40)*math.exp(-(math.hypot(x-f['x'],y-f['y'])/7)**2)
  return [max(0,v-[8,13,19][c])*mask for c,v in enumerate(rgb)]
 add('beacons',i,[math.floor(f['x']-9),math.floor(f['y']-9),19,19],red)
# Positive-light budget exactly reconstructs the original; no dark overlay shapes.
base=photo.copy();pixels=base.load();totalFinal={};metadata=[]
for n,e in enumerate(emitters):
 p=e['im'].load()
 for yy in range(e['h']):
  for xx in range(e['w']):
   X,Y=e['x']+xx,e['y']+yy;rgb=source[X,Y];amount=p[xx,yy];total=totals[X,Y]
   budget=[max(0,v-min(v,max([5,9,14][c],v*.22))) for c,v in enumerate(rgb)]
   amount=tuple(math.floor(v*min(1,budget[c]/max(1,total[c]))) for c,v in enumerate(amount));p[xx,yy]=amount
   new=totalFinal.setdefault((X,Y),[0,0,0])
   for c in range(3):new[c]+=amount[c]
 filename=f'light-{n:02}.png';e['im'].save(OUT/filename,optimize=True)
 metadata.append({k:v for k,v in e.items() if k!='im'}|{'file':filename})
for (x,y),sub in totalFinal.items():pixels[x,y]=tuple(v-sub[c] for c,v in enumerate(source[x,y]))
base.save(OUT/'ambient.png',optimize=True)
# Masks have transparent alpha; opaque white RGB is intentional Cairo maskSurface data.
def maskSave(alpha,path):
 mask=Image.new('RGBA',alpha.size,(255,255,255,0));mask.putalpha(alpha);mask.save(OUT/path,optimize=True)
def paneMask(size,origin,panes,subtract=[]):
 alpha=Image.new('L',size);p=ImageDraw.Draw(alpha)
 for points in panes:p.polygon([(x-origin[0],y-origin[1]) for x,y in points],fill=255)
 for points in subtract:p.polygon([(x-origin[0],y-origin[1]) for x,y in points],fill=0)
 return alpha
b=D['interior']['bounds'];panes=paneMask((b['w'],b['h']),(b['x'],b['y']),D['interior']['panes'],D['interior']['furniture']);alpha=panes.load()
for y in range(b['h']):
 for x in range(b['w']):
  r,g,blue=source[x+b['x'],y+b['y']];warm=smooth((r-blue-12)/46);bright=smooth((r-57)/89)*smooth((g-34)/58)
  alpha[x,y]=round(alpha[x,y]*236/255*(.38+.62*warm*bright))
maskSave(panes,'interior-mask.png')
for n,bridge in enumerate(D['transit']['bridges']):
 b=bridge['bounds'];panes=paneMask((b['w'],b['h']),(b['x'],b['y']),bridge['panes']);alpha=panes.load()
 for y in range(b['h']):
  for x in range(b['w']):
   r,g,blue=source[x+b['x'],y+b['y']];warm=smooth((r-blue-2)/44);lum=r*.28+g*.57+blue*.15
   body=smooth((lum-25)/60)*(.24+.76*warm);reflection=1-.38*smooth((blue-r+2)/45)
   alpha[x,y]=round(alpha[x,y]*236/255*body*reflection)
 maskSave(panes,f'transit-{n}-mask.png')
hard=paneMask((W,H),(0,0),D['water']['waterRegions']);soft=hard.filter(ImageFilter.GaussianBlur(20));hardPixels=hard.load();softPixels=soft.load()
for y in range(H):
 for x in range(W):softPixels[x,y]=min(hardPixels[x,y],round(255*(softPixels[x,y]/255)**4))
maskSave(soft,'water-mask.png')
shaft=photo.crop((619,462,656,800)).convert('RGBA');pane=paneMask((37,338),(619,462),D['elevator']['glass']);p=shaft.load()
for y in range(338):
 for x in range(37):
  r,g,b,_=p[x,y];warm=smooth((r-b-10)/45)*smooth((r-48)/95)
  p[x,y]=(round(r*.14),round(g*.23),round(b*.4),round(pane.getpixel((x,y))*warm*.87))
shaft.save(OUT/'elevator-ambient.png',optimize=True)
(OUT/'metadata.json').write_text(json.dumps({'emitters':metadata,'reconstructionMaxError':0,'source':'assets/abyss.png','width':W,'height':H},indent=2)+'\n')
(ROOT/'extension/nightfall@local/abyss-radiance-data.js').write_text('// Baked source-aligned positive radiance. See tests/build-abyss-native-assets.py.\nexport const EMITTERS = '+json.dumps(metadata)+';\n')
print(f'Baked {len(metadata)} radiance layers and masks. All-on source reconstruction error: 0.')
