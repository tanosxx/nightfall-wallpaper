#!/usr/bin/env python3
"""Guard against rectangular soot cutouts and light painted on the foreground actor."""
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
emission=np.array(Image.open(ROOT/'assets/titans/ground-emission.png'))
assert emission.shape==(941,1672,4)
assert emission[305:815,70:301,3].max()==0,'Foreground alien must have no fire emission overlay'
assert emission[690:761,925:1042,3].max()>150,'Foreground burning wreck has a real source emission map'
assert emission[:290,:,3].max()==0,'Ground emission does not affect the sky'
smoke=np.array(Image.open(ROOT/'assets/titans/ground-smoke.png'))
assert smoke.shape==(320,480,4)
for i in range(6):
 r,c=divmod(i,3);a=smoke[r*160:(r+1)*160,c*160:(c+1)*160,3]
 assert max(a[0].max(),a[-1].max(),a[:,0].max(),a[:,-1].max())==0,'Smoke sprites must feather completely to transparent edges'
 assert a.max()>100 and a.std()>20,'Each soot sprite has internal volume texture'
flames=np.array(Image.open(ROOT/'assets/titans/ground-flames.png'))
assert flames.shape==(384,640,4)
frames=[]
for i in range(24):
 r,c=divmod(i,8);frame=flames[r*128:(r+1)*128,c*80:(c+1)*80]
 assert frame[0,:,3].max()==0,'Flames taper to transparent tops'
 frames.append(frame)
assert all(not np.array_equal(frames[i],frames[(i+1)%24]) for i in range(24)),'Flame shapes evolve, not just their opacity'
print('PASS: ground sprite bounds, transparent edges, flame shape animation, actor exclusion')
