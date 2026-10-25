#!/usr/bin/env python3
"""Billow one continuous photographed smoke field behind the left titan.

The previous short loop crossfaded shifted copies, so the same cloud contours
appeared twice. Here a single source sample is displaced by a smooth, evolving
field at every point. No puff sprites or second photographic copy are mixed.
The 48-second field is baked at 3/4 resolution, keeping native memory bounded.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/titans'
photo = np.asarray(Image.open(ROOT / 'assets/titans.png').convert('RGB'), float)
HEIGHT, WIDTH = photo.shape[:2]
REGION_WIDTH, REGION_HEIGHT = 442, 316
FRAME_WIDTH, FRAME_HEIGHT = 332, 237
FRAMES, COLUMNS = 96, 12
DURATION = 48
# At the image edges the smoke continues off screen. The remainder of this
# hand-traced boundary stays outside every solid robot/wreck/alien silhouette.
outline = [(-100,-100),(442,-100),(442,75),(409,89),(378,105),
           (348,122),(321,145),(310,171),(313,193),(320,219),
           (327,235),(312,249),(299,265),(277,278),(250,274),
           (249,248),(238,249),(220,258),(202,274),(185,284),
           (163,285),(141,294),(117,306),(99,295),(86,277),
           (77,278),(61,293),(39,301),(22,319),(-100,319)]
mask_image = Image.new('L', (WIDTH, HEIGHT))
ImageDraw.Draw(mask_image).polygon(outline, fill=255)
raw = np.asarray(mask_image, float) / 255
blurred = np.asarray(mask_image.filter(ImageFilter.GaussianBlur(10)), float) / 255

def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)

mask = raw * smooth((blurred - .47) / .40)
yy, xx = np.mgrid[0:REGION_HEIGHT, 0:REGION_WIDTH]
destination = mask[:REGION_HEIGHT, :REGION_WIDTH]
original = photo[:REGION_HEIGHT, :REGION_WIDTH]

def sample(array, sx, sy):
    sx = np.clip(sx, 0, WIDTH - 1.001)
    sy = np.clip(sy, 0, HEIGHT - 1.001)
    ix, iy = sx.astype(int), sy.astype(int)
    fx, fy = sx - ix, sy - iy
    if array.ndim == 3:
        fx, fy = fx[..., None], fy[..., None]
    return ((array[iy, ix] * (1-fx) + array[iy, ix+1] * fx) * (1-fy)
            + (array[iy+1, ix] * (1-fx) + array[iy+1, ix+1] * fx) * fy)

atlas = np.zeros((FRAME_HEIGHT * (FRAMES // COLUMNS), FRAME_WIDTH * COLUMNS, 4), np.uint8)
for index in range(FRAMES):
    phase = index / FRAMES * 2*np.pi
    # Travelling broad waves carry finer curls through the smoke. Their
    # different spatial orientations prevent a rigid sheet oscillation.
    # Each point still samples only ONE location in the original photograph.
    dx = (11*np.sin(xx*.007 + yy*.019 + phase*2)
          + 6*np.sin(-xx*.024 + yy*.044 + phase*3 + 1.2)
          + 2.5*np.sin(xx*.051 + yy*.028 + phase*5 + .4))
    dy = (13*np.sin(xx*.012 - yy*.009 + phase + .8)
          + 5*np.sin(xx*.031 + yy*.022 + phase*2 + 2.1)
          + 2*np.sin(-xx*.042 + yy*.037 + phase*5 + 1.4))
    # The source photograph ends at its top/left edges. Make the normal
    # displacement approach zero there instead of repeating a clamped edge
    # row/column into a visible strip during the later phases of the field.
    dx *= smooth(xx / 42)
    dy *= smooth(yy / 42)
    # Fade deformation, not just opacity, before any photographic silhouette.
    # Source validity is applied to colour as well as the destination matte.
    strength = destination**2
    sx, sy = xx + dx*strength, yy + dy*strength
    assert sx.min() >= 0 and sy.min() >= 0, 'Smoke displacement left photograph bounds'
    source_validity = sample(mask, sx, sy)
    sampled = sample(photo, sx, sy)
    valid = strength * source_validity**2
    rgb = original + (sampled - original)*valid[...,None]
    # Very restrained changes of cloud density; no lighting flashes.
    rgb *= (1 + .012*np.sin(xx*.012 + yy*.018 + phase*2)*valid)[...,None]
    frame = np.dstack([rgb, destination*255]).clip(0,255).astype(np.uint8)
    # Premultiplied RGBA resizing prevents dark fringes at the matte border.
    frame_image = Image.fromarray(frame).convert('RGBa').resize(
        (FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS).convert('RGBA')
    frame = np.asarray(frame_image).copy()
    frame[frame[:,:,3] == 0,:3] = 0
    row, column = divmod(index, COLUMNS)
    atlas[row*FRAME_HEIGHT:(row+1)*FRAME_HEIGHT,
          column*FRAME_WIDTH:(column+1)*FRAME_WIDTH] = frame
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(atlas).save(OUT/'left-cloud-flow.png', optimize=True)
print(json.dumps({'frames':FRAMES, 'frameSize':[FRAME_WIDTH,FRAME_HEIGHT],
                  'regionSize':[REGION_WIDTH,REGION_HEIGHT],
                  'durationSeconds':DURATION, 'model':'single-source coherent billowing',
                  'opaquePixels':int((destination>.95).sum())}))
