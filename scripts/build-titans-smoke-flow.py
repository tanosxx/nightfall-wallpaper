#!/usr/bin/env python3
"""Bake upward advection of photograph-only smoke, with no solid geometry.

Masks constrain both source and destination samples. Two travelling phases
crossfade before resetting; the smoke always flows upward, never reverses.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/titans'
photo=np.asarray(Image.open(ROOT/'assets/titans.png').convert('RGB'),dtype=float)
H,W=photo.shape[:2]
regions=[
 dict(key='near',box=[816,609,214,124],flow=[-10,-24],poly=[(823,640),(840,626),(857,619),(874,622),(891,614),(904,625),(909,639),(928,635),(946,643),(954,656),(972,668),(983,690),(1000,714),(987,725),(961,714),(949,694),(927,680),(906,672),(879,657),(855,651)]),
 dict(key='right',box=[1568,373,104,166],flow=[-13,-62],poly=[(1612,388),(1635,381),(1657,398),(1671,407),(1671,519),(1655,534),(1610,519),(1602,496),(1581,476),(1589,450),(1583,431),(1598,415),(1595,402)]),
 dict(key='wreck',box=[1364,438,104,93],flow=[-13,-37],poly=[(1391,451),(1413,445),(1426,454),(1432,472),(1445,486),(1449,508),(1423,522),(1395,512),(1386,490),(1379,476)]),
 dict(key='horizon',box=[851,241,116,131],flow=[-12,-32],poly=[(870,249),(886,244),(899,256),(901,273),(914,288),(915,310),(929,317),(938,338),(947,354),(936,365),(925,351),(918,331),(904,320),(899,302),(887,286),(883,271),(869,263)]),
]

def smooth(v):
 v=np.clip(v,0,1);return v*v*(3-2*v)
def sample(a,x,y):
 ah,aw=a.shape[:2]
 x=np.clip(x,0,aw-1.001);y=np.clip(y,0,ah-1.001)
 ix=x.astype(int);iy=y.astype(int);fx=x-ix;fy=y-iy
 if a.ndim==3:fx=fx[...,None];fy=fy[...,None]
 return (a[iy,ix]*(1-fx)+a[iy,ix+1]*fx)*(1-fy)+(a[iy+1,ix]*(1-fx)+a[iy+1,ix+1]*fx)*fy
N=48;COLS=8
for r in regions:
 x0,y0,w,h=r['box'];dx,dy=r['flow']
 mask=Image.new('L',(W,H));ImageDraw.Draw(mask).polygon(r['poly'],fill=255)
 # Feather inward. Alpha is zero outside the traced smoke-only polygon.
 raw=np.asarray(mask,dtype=float)/255
 feather=np.asarray(mask.filter(ImageFilter.GaussianBlur(9)),dtype=float)/255
 m=raw*smooth((feather-.50)/.38)
 yy,xx=np.mgrid[y0:y0+h,x0:x0+w]
 dm=m[y0:y0+h,x0:x0+w]
 atlas=np.zeros((h*6,w*COLS,4),dtype=np.uint8)
 for f in range(N):
  phase=f/N; weights=[];layers=[]
  for p in [phase,(phase+.5)%1]:
   # Texture features travel up and left; broad eddies break straight stripes.
   sx=xx-dx*p+2*np.sin(yy*.072+phase*2*np.pi)*np.sin(np.pi*p)
   sy=yy-dy*p+2.8*np.sin(xx*.045-phase*2*np.pi)*np.sin(np.pi*p)
   weights.append(sample(m,sx,sy))
   layers.append(sample(photo,sx,sy))
  blend=(1-np.cos(phase*2*np.pi))/2
  a=weights[0]*blend; b=weights[1]*(1-blend); total=a+b
  rgb=(layers[0]*a[...,None]+layers[1]*b[...,None])/np.maximum(total[...,None],.00001)
  frame=np.dstack([rgb,dm*total*248]).clip(0,255).astype(np.uint8)
  frame[frame[:,:,3]==0,:3]=0
  row,col=divmod(f,COLS);atlas[row*h:(row+1)*h,col*w:(col+1)*w]=frame
 Image.fromarray(atlas).save(OUT/f'ground-flow-{r["key"]}.png',optimize=True)
# Photographic billows retain the dense lighting detail of the actual soot.
coords=[(1592,408,48,48),(1611,433,48,48),(1613,393,48,48),(878,637,44,44),(909,650,44,44),(1390,460,40,40)]
S=160;y,x=np.mgrid[0:S,0:S];xx=x/(S-1)*2-1;yy=y/(S-1)*2-1
atlas=np.zeros((S*2,S*3,4),dtype=np.uint8)
for i,(cx,cy,cw,ch) in enumerate(coords):
 texture=np.asarray(Image.fromarray(photo.astype(np.uint8)).crop((cx,cy,cx+cw,cy+ch)).resize((S,S),Image.Resampling.BICUBIC),float)
 luminance=texture.mean(axis=2,keepdims=True)
 texture=luminance+(texture-luminance)*.35
 radius=np.sqrt((xx+.08*np.sin(yy*7+i))**2+(yy+.08*np.sin(xx*6+i))**2)
 alpha=smooth((1-radius)/.35)*smooth((1-np.maximum(abs(xx),abs(yy)))/.15)
 # Keep high-frequency photographic folds, soften only the outer silhouette.
 lum=texture.mean(axis=2);alpha*=np.clip(.72+(95-lum)/150,.60,1)
 rgba=np.dstack([texture,alpha*230]).clip(0,255).astype(np.uint8)
 rgba[rgba[:,:,3]==0,:3]=0
 row,col=divmod(i,3);atlas[row*S:(row+1)*S,col*S:(col+1)*S]=rgba
Image.fromarray(atlas).save(OUT/'ground-smoke.png',optimize=True)
print(json.dumps({'flows':[{k:r[k] for k in ['key','box','flow']} for r in regions],'frames':N,'duration':6,'photographicSmokeSprites':6}))
