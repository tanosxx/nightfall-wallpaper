#!/usr/bin/env python3
"""Bake small, photographed sky-effect textures; never move a ship silhouette.

Only source photograph pixels and deterministic noise are used here. This is a
build-time utility: the wallpaper loads the resulting PNGs without preprocessing.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'titans'
SOURCE = ROOT / 'concepts' / 'fallen-titans-v1.png'
OUT.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE).convert('RGB')
assert source.size == (1672, 941), source.size
rng = np.random.default_rng(197304)


def smooth_noise(width, height, octaves=(5, 11, 23, 51)):
    result = np.zeros((height, width), dtype=np.float32)
    total = 0
    for index, size in enumerate(octaves):
        weight = 0.58 ** index
        values = Image.fromarray(rng.integers(0, 256, (size, size), dtype=np.uint8))
        result += np.asarray(values.resize((width, height), Image.Resampling.BICUBIC)) / 255 * weight
        total += weight
    return result / total


def save_rgba(name, rgb, alpha):
    rgba = np.empty((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    Image.fromarray(rgba).save(OUT / name, optimize=True)


# A transparent atlas at photographic coordinates. Polygons explicitly exclude
# the planet/rim light, and alpha selects only real orange/white fire pixels.
crop = source.crop((790, 0, 1640, 290))
rgb = np.asarray(crop, dtype=np.float32)
mask = Image.new('L', crop.size)
draw = ImageDraw.Draw(mask)
for polygon in [
    [(1070, 0), (1186, 0), (1271, 68), (1310, 124), (1364, 114), (1408, 237), (1318, 245), (1152, 143), (1083, 85)],
    [(806, 64), (864, 74), (905, 154), (874, 172), (839, 127)],
    [(1420, 0), (1466, 0), (1484, 91), (1454, 94)],
    [(1524, 66), (1553, 61), (1605, 196), (1577, 211)],
    [(1475, 177), (1503, 172), (1543, 266), (1515, 273)],
]:
    draw.polygon([(x-790, y) for x, y in polygon], fill=255)
red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
warm = np.clip((red-blue-10)/65, 0, 1)
hot = np.clip((red-124)/108, 0, 1)
alpha = warm * hot * np.asarray(mask)/255
save_rgba('sky-emissions.png', rgb, alpha)

# Photo smoke, normalized to charcoal without carrying any hard rectangular
# feature or ship geometry. Each sprite has a different organic border.
for index, box in enumerate([(1044, 0, 1124, 66), (748, 0, 815, 66), (1395, 219, 1463, 281)]):
    size = 160
    tex = source.crop(box).resize((size, size), Image.Resampling.BICUBIC)
    tex = np.asarray(tex, dtype=np.float32)
    detail = tex.mean(axis=2)
    detail = (detail - detail.min()) / max(1, detail.max()-detail.min())
    noise = smooth_noise(size, size)
    y, x = np.mgrid[-1:1:complex(size), -1:1:complex(size)]
    radius = np.sqrt((x*1.03)**2 + (y*.95)**2)
    edge = np.clip((1-radius+(noise-.5)*.40)/.27, 0, 1)
    density = np.clip((noise-.20)*2.2, 0, 1) * edge * (.40+.60*detail)
    density *= np.clip(np.minimum(1-np.abs(x), 1-np.abs(y)) / .14, 0, 1)
    # The uneven photo density retains translucent gaps through the billow.
    density *= .96
    smoke_rgb = np.empty((size, size, 3), dtype=np.float32)
    shade = 29 + detail*52 + noise*15
    smoke_rgb[:, :, 0] = shade*.99
    smoke_rgb[:, :, 1] = shade*1.02
    smoke_rgb[:, :, 2] = shade*1.08
    save_rgba(f'sky-smoke-{index}.png', smoke_rgb, density)

# Narrow, textured flames, tapered to zero at the root's sides and tip. They
# flow from photographed ignition points, never cover a solid hull rectangle.
w, h = 64, 128
noise = smooth_noise(w, h, (5, 13, 29, 61))
y, x = np.mgrid[0:1:complex(h), -1:1:complex(w)]
centre = .13*np.sin(y*11) + (noise-.5)*.36
width = .06 + .55*(y**.72)
shape = np.clip(1-np.abs(x-centre)/width, 0, 1)**1.3
shape *= np.clip(y*6, 0, 1) * np.clip((1-y)*10, 0, 1)
shape *= np.clip((noise-.24)*2.25, 0, 1)
hot = np.clip(shape*1.6 + y*.16, 0, 1)
flame = np.empty((h, w, 3), dtype=np.float32)
flame[:, :, 0] = 255
flame[:, :, 1] = 66+hot*174
flame[:, :, 2] = 9+hot**2*160
save_rgba('sky-flame.png', flame, shape)

# Textured asymmetric flash, deliberately non-circular at useful sizes.
size = 128
y, x = np.mgrid[-1:1:complex(size), -1:1:complex(size)]
noise = smooth_noise(size, size, (7, 15, 29, 67))
radius = np.sqrt((x*1.02)**2+(y*1.12)**2)
density = np.clip((.84-radius+(noise-.5)*.6)*2.1, 0, 1)
hot = np.clip(1-radius*1.5, 0, 1)
fire = np.empty((size, size, 3), dtype=np.float32)
fire[:, :, 0] = 255
fire[:, :, 1] = 102 + hot*150
fire[:, :, 2] = 25+hot**2*191
save_rgba('sky-burst.png', fire, density)

# Soft environmental radiance, always drawn much fainter than its tiny core.
alpha = np.exp(-(x*x+y*y)*6) * np.clip(1-radius, 0, 1)
glow = np.empty((size, size, 3), dtype=np.float32)
glow[:, :, :] = (255, 139, 59)
save_rgba('sky-glow.png', glow, alpha)

# Replace only photographed smoke interiors with an advected copy of their
# own texture. The feathered masks stop before any hull edge or planet rim.
# Two staggered streams are cross-faded, so the flow is always up-left rather
# than reversing direction. The sheet is immutable and bounded at runtime.
FLOW_REGIONS = [
    ((945, 0, 1150, 115), [(962,0),(1120,0),(1122,17),(1137,33),(1126,52),
        (1100,69),(1112,81),(1092,92),(1054,88),(1030,62),(985,48)]),
    ((660, 0, 870, 130), [(666,0),(809,0),(822,21),(823,52),(846,80),
        (850,100),(836,108),(819,103),(809,88),(789,88),(774,67),
        (747,69),(738,40),(699,37)]),
]
FLOW_FRAMES = 32
FLOW_COLUMNS = 8
FLOW_CELL_W = 212
FLOW_CELL_H = 132
sheet = Image.new('RGBA', (FLOW_COLUMNS * FLOW_CELL_W,
    (FLOW_FRAMES // FLOW_COLUMNS) * FLOW_CELL_H * len(FLOW_REGIONS)))
source_array = np.asarray(source, dtype=np.float32)
def bilinear_sample(x, y):
    x = np.clip(x, 0, source.width-1.001)
    y = np.clip(y, 0, source.height-1.001)
    x0 = x.astype(np.int32); y0 = y.astype(np.int32)
    fx = (x-x0)[...,None]; fy = (y-y0)[...,None]
    return (source_array[y0,x0]*(1-fx)*(1-fy)
        + source_array[y0,x0+1]*fx*(1-fy)
        + source_array[y0+1,x0]*(1-fx)*fy
        + source_array[y0+1,x0+1]*fx*fy)
for region_index, (box, polygon) in enumerate(FLOW_REGIONS):
    left, top, right, bottom = box
    width, height = right-left, bottom-top
    m = Image.new('L', (width,height)); d = ImageDraw.Draw(m)
    d.polygon([(x-left,y-top) for x,y in polygon], fill=255)
    # Erosion before feathering prevents alpha extending into the hull.
    m = m.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(3.2))
    alpha = np.asarray(m,dtype=np.float32)/255
    original_rgb = np.asarray(source.crop(box),dtype=np.float32)
    yy, xx = np.mgrid[0:height,0:width].astype(np.float32)
    for frame in range(FLOW_FRAMES):
        phase = frame/FLOW_FRAMES
        a = phase
        b = (phase+.5)%1
        weight_a = np.sin(a*np.pi)**2
        weight_b = np.sin(b*np.pi)**2
        # The smoke travels 34/29 pixels during the eight second loop.
        # Spatial distortion follows that same travelling field, avoiding a
        # rigid sliding cloud patch or a ping-pong animation.
        def stream(p):
            dx = p*34 + 2.6*np.sin((yy+p*29)*.08 + xx*.035)
            dy = p*29 + 2.1*np.sin((xx+p*34)*.07 - yy*.024)
            sample_x = xx+dx-17
            sample_y = yy+dy-14.5
            # Sampling is restricted as well as compositing: a moving smoke
            # texel cannot bring a neighbouring hull pixel into the mask.
            valid = ((sample_x>=0)&(sample_x<width-1)&(sample_y>=0)&(sample_y<height-1))
            source_alpha = alpha[np.clip(sample_y.astype(int),0,height-1),
                np.clip(sample_x.astype(int),0,width-1)]
            valid = (valid*source_alpha)[...,None]
            flowing = bilinear_sample(left+sample_x,top+sample_y)
            return original_rgb*(1-valid)+flowing*valid
        rgb = stream(a)*weight_a + stream(b)*weight_b
        rgba = np.empty((height,width,4),dtype=np.uint8)
        rgba[:,:,:3] = np.clip(rgb,0,255)
        rgba[:,:,3] = np.clip(alpha*255,0,255)
        cell_x = (frame%FLOW_COLUMNS)*FLOW_CELL_W
        cell_y = (region_index*FLOW_FRAMES//FLOW_COLUMNS+frame//FLOW_COLUMNS)*FLOW_CELL_H
        sheet.paste(Image.fromarray(rgba),(cell_x,cell_y))
sheet.save(OUT/'sky-flow.png',optimize=True)
files = sorted(OUT.glob('sky-*.png'))
print(json.dumps({'files': [p.name for p in files],
    'bytes': sum(p.stat().st_size for p in files), 'flowAtlas': 'sky-flow.png'}))
