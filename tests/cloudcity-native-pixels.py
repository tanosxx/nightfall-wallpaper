#!/usr/bin/env python3
"""Run after gjs -m tests/cloudcity-native.test.js; requires Pillow + NumPy."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
frames = [np.array(Image.open(f'/tmp/nightfall-cloudcity-native-{time}.png').convert('RGB')).astype(int) for time in [0, 60, 600]]
patches = [
    (536,706,9,9),(606,726,9,9),(616,753,9,9),
    (262,709,3,3),(443,739,3,3),(830,759,3,3),(1278,799,3,3),
    (699,692,3,3),(1049,718,3,3),(1099,771,3,3),(999,845,3,3),
    (179,755,3,3),(1523,743,3,3),(704,865,3,3),
    (172,580,100,40),(180,625,70,24),(330,685,70,24),(494,741,32,20),(550,780,60,16),
]
for x,y,w,h in patches:
    for frame in frames[1:]:
        assert np.array_equal(frame[y:y+h,x:x+w],frames[0][y:y+h,x:x+w]), f'Static architecture/cloud patch moved: {x},{y}'
mask=np.array(Image.open(ROOT/'assets/cloudcity-native/cloud-mask.png'))[:,:,3]
assert not np.any(mask[470:,:651]), 'Lower-left original photograph is no longer protected'
# These facades and the skybridge were missing from the old right-hand matte.
# Test the atmospheric mask separately from independently blinking windows.
for x,y in [(1310,420),(1317,450),(1328,407),(1258,415),(1375,417),(1359,678),(1480,600)]:
    assert mask[y,x]==0, f'Cloud layer erases right-hand architecture at {x},{y}'
# The old right-facade cut at y646 went from 128 to255 in just two pixels.
# Keep the original mist there and blend continuously beyond the silhouette.
for x in [1585,1600,1620,1640,1660]:
    steps=np.abs(np.diff(mask[620:701,x].astype(int)))
    assert steps.max()<=12, f'Hard photographic cut under right facade at x={x}: {steps.max()}/pixel'
for top in [480,550,620]:
    a=frames[0][top:top+40,880:1080].mean(axis=2)
    b=frames[1][top:top+40,931:1131].mean(axis=2)
    correlation=float(np.corrcoef(a.flatten(),b.flatten())[0,1])
    assert correlation>.999, f'Cloud pattern did not translate coherently by 51 px at y={top}: {correlation}'
assert np.array_equal(np.array(Image.open('/tmp/nightfall-cloudcity-native-paused-a.png')),
    np.array(Image.open('/tmp/nightfall-cloudcity-native-paused-b.png'))), 'Pause or pointer changed visible pixels'
assert np.mean(np.abs(frames[0][480:660,850:1150]-frames[2][480:660,850:1150]))>4, 'Cloud ocean is static'
assert np.mean(np.abs(frames[0][365:520,405:520]-frames[1][365:520,405:520]))>2, 'Photographic turbine is static'
assert np.mean(np.abs(frames[0][14:58,198:259]-frames[1][14:58,198:259]))>2, 'Warm room circuits are static'
print('Cloudcity pixels PASS: 19 exact static patches; protected lower left; 51 px coherent cloud translation at 3 heights; active turbine/windows; exact pause.')
