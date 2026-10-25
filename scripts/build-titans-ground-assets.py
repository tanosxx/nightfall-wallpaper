#!/usr/bin/env python3
"""Bake a deterministic fire atlas and soft, multi-scale soot textures.

These sprites contain no architecture or characters. All moving texture pixels
are transparent emission/vapour; the source photograph stays stationary.
"""
from pathlib import Path
import json
import sys
import subprocess
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'titans'
OUT.mkdir(parents=True, exist_ok=True)
PHOTO = Image.open(ROOT / 'concepts' / 'fallen-titans-v1.png').convert('RGB')


def noise(w, h, seed, octaves=(3, 7, 15, 31, 63)):
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w), dtype=np.float64)
    total = 0
    for i, size in enumerate(octaves):
        a = rng.random((max(2, round(size * h / w)), size))
        pic = Image.fromarray(np.uint8(a * 255), 'L').resize((w, h), Image.Resampling.BICUBIC)
        weight = .56 ** i
        field += np.asarray(pic) / 255 * weight
        total += weight
    return field / total


def save(array, filename):
    if '--fire-only' in sys.argv and filename == 'ground-smoke.png':
        return
    pixels = np.uint8(np.clip(array, 0, 255))
    pixels[pixels[:, :, 3] == 0, :3] = 0
    Image.fromarray(pixels, 'RGBA').save(OUT / filename, optimize=True)


# Advect a real, transparent flame texture from the foreground wreck. Motion
# changes the ragged luminous silhouette, retaining the source photo's turbulent
# combustion detail rather than replacing it with smooth procedural candle cones.
FW, FH, NF = 80, 128, 24
atlas = np.zeros((FH * 3, FW * 8, 4))
source = np.asarray(PHOTO.crop((944,684,986,751)).resize((FW,FH),Image.Resampling.BICUBIC),dtype=float)
r,g,b = source[:,:,0],source[:,:,1],source[:,:,2]
# Only glowing fuel is admitted, with near-black smoke and solid metal excluded.
source_alpha = np.clip((r-b-35)/92,0,1) * np.clip((r-105)/110,0,1)
source_alpha *= np.clip((g-67)/125,0,1)
y,x = np.mgrid[0:FH,0:FW]
xn=x/(FW-1);yn=y/(FH-1);z=1-yn
edge=np.clip(np.minimum(xn,1-xn)/.12,0,1)*np.clip(yn/.08,0,1)
source_alpha *= edge
source = np.dstack([source,source_alpha*255])
field=noise(FW*4,FH*4,115,(7,15,31,63,127))
def sample(source,sx,sy):
    sx=np.clip(sx,0,FW-1.001);sy=np.clip(sy,0,FH-1.001)
    x0=sx.astype(int);y0=sy.astype(int);fx=(sx-x0)[...,None];fy=(sy-y0)[...,None]
    return (source[y0,x0]*(1-fx)+source[y0,x0+1]*fx)*(1-fy)+(source[y0+1,x0]*(1-fx)+source[y0+1,x0+1]*fx)*fy
for f in range(NF):
    phase=f/NF*2*np.pi
    xx=((x*1.5+phase*20)%(FW*4)).astype(int)
    yy=((y*1.3+f/NF*FH*4)%(FH*4)).astype(int)
    n=field[yy,xx]
    # A fixed flame root feeds rolling upward folds and one consistent lean.
    sx=x + z*(8*np.sin(z*10-phase)+5*np.sin(z*19-phase*2)+(n-.5)*12)
    sy=y + z*(13*np.sin(z*8-phase+xn*4)+7*np.sin(z*17-phase*2+xn*7))
    frame=sample(source,sx,sy)
    fade=np.clip(yn/.07,0,1)*np.clip(np.minimum(xn,1-xn)/.10,0,1)
    frame[:,:,3] *= fade
    row,col=divmod(f,8)
    atlas[row*FH:(row+1)*FH,col*FW:(col+1)*FW]=frame
save(atlas, 'ground-flames.png')

# Textured vapour is a continuous irregular field, not overlapping filled circles.
SW = 160
smoke = np.zeros((SW * 2, SW * 3, 4))
y, x = np.mgrid[0:SW, 0:SW]
xx = (x / (SW - 1) - .5) * 2
yy = (y / (SW - 1) - .5) * 2
for i in range(6):
    n = noise(SW, SW, 340 + i, (4, 9, 19, 39, 79))
    fine = noise(SW, SW, 740 + i, (9, 19, 39, 79))
    radius = np.sqrt((xx + .16 * np.sin(yy * 5 + i)) ** 2 + (yy * 1.04) ** 2)
    silhouette = np.clip((1.03 - radius + (n - .5) * .42) * 3.0, 0, 1)
    edge = np.clip((1 - np.maximum(np.abs(xx), np.abs(yy))) / .23, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    alpha = silhouette ** 1.7 * np.clip((n - .20) * 1.34, 0, 1) * edge
    # The broad lighting gradient agrees with the low sun on the right.
    light = np.clip(.20 + .50 * n + .22 * fine + xx * .09, 0, 1)
    rgb = np.stack([29 + light * 70, 28 + light * 65, 27 + light * 59], -1)
    row, col = divmod(i, 3)
    smoke[row * SW:(row + 1) * SW, col * SW:(col + 1) * SW] = np.dstack([rgb, alpha * 205])
save(smoke, 'ground-smoke.png')

# A tightly masked source emission map recovers the detailed photographic flames
# when their light swells. Hard surfaces and the alien have identically zero alpha.
photo = np.asarray(PHOTO, dtype=float)
r, g, b = photo[:, :, 0], photo[:, :, 1], photo[:, :, 2]
emission = np.clip((r - b - 22) / 85, 0, 1) * np.clip((r - 105) / 100, 0, 1)
# Restrict to registered fire areas; no stars, sky, character, metal edges outside.
regions = [(925,690,1042,761),(542,465,625,510),(354,351,406,401),
 (551,292,617,342),(615,534,668,573),(533,607,579,639),(1230,472,1420,522),
 (1590,511,1672,552),(1495,795,1578,828),(1447,531,1530,555),
 (1376,666,1409,691),(1264,621,1318,646),(28,393,60,431),
 (1343,303,1473,334),(922,349,964,377),(1141,617,1175,646)]
mask = np.zeros(emission.shape)
for x0,y0,x1,y1 in regions:
    yy0, xx0 = np.mgrid[y0:y1, x0:x1]
    edge = np.minimum.reduce([(xx0-x0+1)/4,(x1-xx0)/4,(yy0-y0+1)/4,(y1-yy0)/4])
    mask[y0:y1,x0:x1] = np.clip(edge,0,1)
emission *= mask
save(np.dstack([photo, emission * 200]), 'ground-emission.png')
print(json.dumps({'files': [p.name for p in sorted(OUT.glob('ground-*.png'))], 'flameFrames': NF, 'smokeVariants': 6, 'emissionPixelCount': int((emission > 0).sum())}))

# The full build finishes with photographic smoke and its flow atlases.
if "--fire-only" not in sys.argv:
    subprocess.run([sys.executable, str(ROOT / "scripts/build-titans-smoke-flow.py")], check=True)
