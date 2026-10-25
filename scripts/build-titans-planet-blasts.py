#!/usr/bin/env python3
"""Bake evolving, distant volumetric mushroom clouds for the planet surface.

No runtime image processing is needed. Sixty-four immutable frames share one
atlas, keeping the native Cairo crop cache bounded. This is an artistic effect
for a fictional wallpaper; all dimensions are image-space design parameters.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'titans'
OUT.mkdir(parents=True, exist_ok=True)
W, H, FRAMES, COLUMNS = 128, 176, 64, 8
LIFETIME = 19.0
rng = np.random.default_rng(471909)

# A periodic texture scrolls through each billow as it rolls outward. The same
# noise field is sampled across the lifecycle, avoiding frame-to-frame sparkle.
noise = np.zeros((512, 512), np.float32)
weight = 0
for size, strength in [(7, 1), (17, .53), (41, .27), (103, .12)]:
    grid = rng.integers(0, 256, (size, size), dtype=np.uint8)
    noise += np.asarray(Image.fromarray(grid).resize((512, 512), Image.Resampling.BICUBIC)) / 255 * strength
    weight += strength
noise /= weight
photograph = Image.open(ROOT/'assets'/'titans.png').convert('L')
cloud_detail = np.asarray(photograph.crop((35,30,276,221)).resize((256,256),Image.Resampling.BICUBIC),dtype=np.float32)
cloud_detail = np.clip((cloud_detail-np.percentile(cloud_detail,3))/max(1,np.percentile(cloud_detail,97)-np.percentile(cloud_detail,3)),0,1)


def smooth(t):
    t = np.clip(t, 0, 1)
    return t*t*(3-2*t)


def render(age):
    pixels = np.zeros((H, W, 4), np.float32)  # Premultiplied during compositing.
    rise = 1 - math.exp(-age / 5.4)
    cap_y = 155 - rise * 65
    cap_x = 64 + math.sin(age*.14)*2.2
    cap_r = 8 + 37*(1-math.exp(-age/4.6))
    heat = .78*math.exp(-max(0, age-.55) / 4.2)+.22*math.exp(-age/11)
    opacity = float(smooth(age/.22) * smooth((LIFETIME-age)/4.5))
    puffs = []

    # The irregular rising column broadens beneath the rolling cap. Each
    # parcel follows upward flow; this is not a static mushroom scaled up.
    stem_h = max(1, 160-cap_y)
    for j in range(31):
        v = j/30
        cy = 161 - v*stem_h*.96
        cx = cap_x + math.sin(v*13-age*.65)*4.2*(.3+v)
        radius = (16.5 + v*6.0 + v**4*7) * (.38+.62*rise)
        radius *= .88+.16*math.sin(j*3.3)
        puffs.append((.1+v*.2, cx, cy, radius, radius*(1.6 if v<.7 else 1.3),
                      j*17, heat*(1.1+.35*v), .50))
    # Turbulent, diffuse skirts at the base tether the column to the surface.
    # Their broadening ring has no sharp circular outline.
    for j in range(9):
        theta=j/9*math.tau
        spread=(7+age*1.15)*math.sin(theta)
        puffs.append((-.8,cap_x+spread,159+math.cos(theta)*3,
                      8+age*.85,5+age*.20,1200+j*31,heat*.90,.43))

    # Back-to-front spherical billows around a toroidal cap create rounded
    # cauliflower lobes with a shaded underside rather than a flat oval.
    for j in range(15):
        theta = j / 15 * math.tau + age*.032
        depth = math.sin(theta)
        cx = cap_x + math.cos(theta)*cap_r*(.63+.06*math.sin(j*5.4))
        cy = cap_y + depth*cap_r*.29 + cap_r*.14*math.sin(j*7.3+age*.2)
        radius = cap_r*(.32+.08*math.sin(j*3.7+age*.12))
        puffs.append((depth, cx, cy, radius, radius*1.07, 217+j*29,
                      heat*(.42+.82*max(0,depth)), .87))
    for j in range(9):
        theta = j/9*math.tau
        cx = cap_x + math.cos(theta)*cap_r*.34
        cy = cap_y - cap_r*.10 + math.sin(theta)*cap_r*.21
        radius = cap_r*(.35+.04*math.sin(j*5.1))
        puffs.append((.4+math.sin(theta)*.3, cx, cy, radius, radius*1.06,
                      891+j*19, heat*(.4+.22*math.cos(theta)), .88))
    for j in range(9):
        theta=j/9*math.tau
        drift=(1-math.exp(-age/8))*cap_r*.15
        cx=cap_x+math.cos(theta)*cap_r*.88+drift
        cy=cap_y+math.sin(theta)*cap_r*.21-age*.22
        puffs.append((-.9,cx,cy,cap_r*.24,cap_r*.23,1700+j*43,heat*.35,.27))

    for depth, cx, cy, rx, ry, seed, warmth, density in sorted(puffs):
        if rx < .4 or ry < .4:
            continue
        x0, x1 = max(0, math.floor(cx-rx*1.25)), min(W, math.ceil(cx+rx*1.25))
        y0, y1 = max(0, math.floor(cy-ry*1.25)), min(H, math.ceil(cy+ry*1.25))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        ux, uy = (xx-cx)/rx, (yy-cy)/ry
        tx = (xx*3+seed+int(age*8)) % 512
        ty = (yy*3+seed*3-int(age*11)) % 512
        px=(xx*4+seed+int(age*6))%256
        py=(yy*4+seed*7-int(age*8))%256
        tex = noise[ty,tx]*.55+cloud_detail[py,px]*.45
        radial = ux*ux + uy*uy
        boundary = 1 + (tex-.5)*1.5
        edge = np.clip((boundary-radial)/.68, 0, 1)
        alpha = edge**1.3*density*opacity
        normal_z = np.sqrt(np.clip(1-radial, 0, 1))
        light = np.clip(.52 - ux*.25 - uy*.43 + normal_z*.28, 0, 1)
        shade = 42 + light*58 + (tex-.5)*62
        smoke = np.stack((shade*.98, shade*1.015, shade*1.045), axis=-1)
        hot = np.clip(warmth*(.65+normal_z*.45+(tex-.5)*.4), 0, 1)
        fire = np.stack((183+72*normal_z, 61+156*normal_z**1.6,
                         18+110*normal_z**3), axis=-1)
        rgb = smoke*(1-hot[...,None]) + fire*hot[...,None]
        # A little scattered pale atmosphere keeps a far-away blast within
        # the photograph's colour range rather than opaque black soot.
        rgb = rgb*.80 + np.array([117,120,119])*.20
        destination = pixels[y0:y1,x0:x1]
        destination[:,:,:3] = rgb*alpha[...,None] + destination[:,:,:3]*(1-alpha[...,None])
        destination[:,:,3] = alpha + destination[:,:,3]*(1-alpha)

    alpha = pixels[:,:,3]
    pixels[:,:,:3] /= np.maximum(alpha[...,None], 1e-6)
    pixels[:,:,3] *= 255
    return Image.fromarray(np.clip(pixels,0,255).astype(np.uint8), 'RGBA')


atlas = Image.new('RGBA', (W*COLUMNS, H*math.ceil(FRAMES/COLUMNS)))
contact = Image.new('RGB', (W*8,H*2), (113,116,114))
for frame in range(FRAMES):
    tile = render(frame/(FRAMES-1)*LIFETIME)
    atlas.paste(tile, ((frame%COLUMNS)*W,(frame//COLUMNS)*H))
    if frame % 4 == 0:
        slot = frame//4
        contact.paste(tile, ((slot%8)*W,(slot//8)*H), tile)
atlas.save(OUT/'planet-mushroom-atlas.png', optimize=True)
(ROOT/'validation').mkdir(exist_ok=True)
contact.save(ROOT/'validation'/'titans-planet-atlas-contact.png')
print(json.dumps({'asset':'planet-mushroom-atlas.png','frames':FRAMES,'tile':[W,H],
                  'lifetime':LIFETIME,'bytes':(OUT/'planet-mushroom-atlas.png').stat().st_size}))
