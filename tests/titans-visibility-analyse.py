#!/usr/bin/env python3
"""Measure source-coordinate effect ROIs, excluding welding from motion counts.

Difference metrics supplement actual visual review; they are not proof that
motion looks natural. Output includes enlarged temporal strips for inspection.
"""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'current'
if not LABEL or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in LABEL):
    raise ValueError('Unsafe evidence label')
OUT = ROOT / 'validation' / f'titans-visibility-{LABEL}'
ROIS = {
    'foreground-fire': (920, 690, 1050, 770),
    'foreground-smoke': (875, 600, 1005, 700),
    'right-smoke': (1560, 420, 1668, 516),
    'robot-fire': (550, 290, 609, 340),
    'ship-trail': (1040, 0, 1180, 100),
    'ship-fire': (1080, 20, 1200, 130),
    'alien-protected': (245, 450, 440, 720),
}
render = json.loads((OUT / 'render.json').read_text())
images = [Image.open(OUT / f'frame-{s["index"]}.png').convert('RGB') for s in render['samples']]
arrays = np.stack([np.asarray(im, dtype=np.int16) for im in images])
photo = np.asarray(Image.open(ROOT / 'assets' / 'titans.png').convert('RGB'), dtype=np.int16)
metrics = {}
strip_rows = []
for name, (x0, y0, x1, y1) in ROIS.items():
    region = arrays[:, y0:y1, x0:x1, :]
    temporal_range = np.max(np.ptp(region, axis=0), axis=-1)
    second_delta = np.max(np.abs(region[2] - region[0]), axis=-1)
    adjacent_delta = np.max(np.abs(np.diff(region, axis=0)), axis=-1)
    photo_delta = np.max(np.abs(region - photo[None, y0:y1, x0:x1, :]), axis=-1)
    preview_size = (max(1, round((x1-x0)*.6)), max(1, round((y1-y0)*.6)))
    preview = np.stack([np.asarray(im.crop((x0,y0,x1,y1)).resize(preview_size,Image.Resampling.LANCZOS),dtype=np.int16) for im in images])
    preview_range = np.max(np.ptp(preview,axis=0),axis=-1)
    preview_second = np.max(np.abs(preview[2]-preview[0]),axis=-1)
    metrics[name] = {
        'bounds': [x0,y0,x1,y1],
        'pixelCount': (x1-x0)*(y1-y0),
        'temporalRange': {'mean': float(temporal_range.mean()), 'p50': float(np.percentile(temporal_range,50)), 'p90': float(np.percentile(temporal_range,90)), 'p99': float(np.percentile(temporal_range,99))},
        'changedAtLeast8LevelsFraction': float((temporal_range>=8).mean()),
        'changedAtLeast16LevelsFraction': float((temporal_range>=16).mean()),
        'oneSecondChangedAtLeast8LevelsFraction': float((second_delta>=8).mean()),
        'oneSecondMeanChange': float(second_delta.mean()),
        'meanAdjacentChange': float(adjacent_delta.mean()),
        'meanPhotoDifference': float(photo_delta.mean()),
        'previewAt60Percent': {
            'oneSecondMeanChange': float(preview_second.mean()),
            'oneSecondChangedAtLeast8LevelsFraction': float((preview_second>=8).mean()),
            'temporalRangeP90': float(np.percentile(preview_range,90)),
            'changedAtLeast8LevelsFraction': float((preview_range>=8).mean()),
        },
    }
    chosen = [0,2,4,6]
    scale = 2
    header = 28
    w, h = (x1-x0)*scale, (y1-y0)*scale
    strip = Image.new('RGB',(w*len(chosen),h+header),(18,21,26))
    draw = ImageDraw.Draw(strip)
    for j,i in enumerate(chosen):
        strip.paste(images[i].crop((x0,y0,x1,y1)).resize((w,h),Image.Resampling.NEAREST),(j*w,header))
        draw.text((j*w+5,7),f'{name} | {render["samples"][i]["time"]}s',fill='white')
    strip.save(OUT / f'{name}-strip.png')
    strip_rows.append(strip)
    heat = np.zeros((y1-y0,x1-x0,3),dtype=np.uint8)
    heat[:,:,0] = np.clip(temporal_range*4,0,255)
    heat[:,:,1] = np.clip(temporal_range*2-24,0,255)
    Image.fromarray(heat).resize((w,h),Image.Resampling.NEAREST).save(OUT / f'{name}-difference.png')
width=max(im.width for im in strip_rows)
height=sum(im.height for im in strip_rows)+12*(len(strip_rows)-1)
contact=Image.new('RGB',(width,height),(10,12,16))
y=0
for im in strip_rows:
    contact.paste(im,(0,y)); y+=im.height+12
contact.save(OUT / 'contact.png')
report = {'label':LABEL,'warning':'Numerical visibility thresholds do not verify natural motion; inspect the temporal strips and live animation.', 'renderMillisMean':render['renderMillisMean'],'regions':metrics}
(OUT/'visibility.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
if LABEL != 'before':
    before_path = ROOT / 'validation' / 'titans-visibility-before' / 'visibility.json'
    if before_path.exists():
        before = json.loads(before_path.read_text())
        comparison = {}
        for name, current in metrics.items():
            previous = before['regions'][name]
            old = previous['oneSecondMeanChange']; new = current['oneSecondMeanChange']
            comparison[name] = {
                'oneSecondMeanChangeBefore':old,
                'oneSecondMeanChangeAfter':new,
                'changeMultiplier':round(new/old,2) if old else None,
                'movingFraction8LevelsBefore':previous['changedAtLeast8LevelsFraction'],
                'movingFraction8LevelsAfter':current['changedAtLeast8LevelsFraction'],
            }
        (OUT/'comparison.json').write_text(json.dumps(comparison,indent=2))
        print('BASELINE COMPARISON\n'+json.dumps(comparison,indent=2))
