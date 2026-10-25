"""Inspect regional motion and photograph occlusion in real Cairo composites.
Numerical differences supplement human visual review; they cannot prove realism.
"""
from pathlib import Path
import json
import math
import sys
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
label = sys.argv[1] if len(sys.argv) > 1 else 'current'
if not label or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in label):
    raise ValueError('Unsafe evidence label')
folder = root / 'validation' / f'titans-additions-{label}'
report = json.loads((folder / 'render.json').read_text())
times = report['times']
images = [Image.open(folder / f'frame-{t}.png').convert('RGB') for t in times]
arrays = np.stack([np.asarray(im, dtype=np.int16) for im in images])
regions = {
    'left-smoke': (0, 0, 310, 300),
    'robot-edge': (310, 110, 368, 300),
    'robot-armor-protected': (340, 155, 435, 260),
    'planet-face': (875, 110, 1175, 280),
    'alien-suit': (55, 315, 305, 815),
    'suit-upper': (90, 350, 275, 555),
    'suit-backpack-lamps': (133, 418, 171, 439),
    'suit-forearm-glint': (254, 536, 280, 579),
    'alien-head-protected': (160, 318, 240, 390),
}
baseline_label = sys.argv[2] if len(sys.argv) > 2 else 'before-v15'
if not baseline_label or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in baseline_label):
    raise ValueError('Unsafe baseline label')
before_dir = root / 'validation' / f'titans-additions-{baseline_label}'
baseline = None
if label != baseline_label and (before_dir / 'render.json').exists():
    baseline = np.stack([np.asarray(Image.open(before_dir / f'frame-{t}.png').convert('RGB'), dtype=np.int16) for t in times])
metrics = {}
for name, bounds in regions.items():
    x0, y0, x1, y1 = bounds
    region = arrays[:, y0:y1, x0:x1]
    temporal = np.max(np.ptp(region, axis=0), axis=-1)
    delta1 = np.max(np.abs(region[1] - region[0]), axis=-1)
    entry = {'bounds': bounds, 'temporalP90': float(np.percentile(temporal, 90)),
             'temporalChanged8Fraction': float((temporal >= 8).mean()),
             'oneSecondMeanChange': float(delta1.mean()), 'oneSecondChanged8Fraction': float((delta1 >= 8).mean())}
    if baseline is not None:
        added = np.max(np.abs(region - baseline[:, y0:y1, x0:x1]), axis=-1)
        entry['additionalEffectsMaxChange'] = int(added.max())
        entry['additionalEffectsChanged8Fraction'] = float((added >= 8).mean())
    metrics[name] = entry
    crop_w, crop_h = x1 - x0, y1 - y0
    scale = 2 if name != 'alien-suit' else 1
    canvas = Image.new('RGB', (crop_w * scale * 3, (crop_h * scale + 26) * math.ceil(len(times)/3)), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    for i, (im, t) in enumerate(zip(images, times)):
        x, y = i % 3 * crop_w * scale, i // 3 * (crop_h * scale + 26)
        canvas.paste(im.crop(bounds).resize((crop_w * scale, crop_h * scale), Image.Resampling.LANCZOS), (x, y + 26))
        draw.text((x + 5, y + 7), f'{name}: {t}s', fill='white')
    canvas.save(folder / f'{name}-strip.png')
planet_reference = root / 'validation' / 'titans-additions-before'
planet_checks = []
x0,y0,x1,y1 = regions['planet-face']
for index,t in enumerate(times):
    reference_file = planet_reference / f'frame-{t}.png'
    if reference_file.exists():
        reference = np.asarray(Image.open(reference_file).convert('RGB'),dtype=np.int16)
        delta = np.max(np.abs(arrays[index,y0:y1,x0:x1] - reference[y0:y1,x0:x1]),axis=-1)
        planet_checks.append({'time':t,'matchesVersion13BeforePlanetEffects':bool((delta==0).all()),'maxChange':int(delta.max())})
smoke_repeats=[]
x0,y0,x1,y1=regions['left-smoke']
for first,second in [(0,8),(8,16),(0,16)]:
    if first in times and second in times:
        delta=np.max(np.abs(arrays[times.index(first),y0:y1,x0:x1]-arrays[times.index(second),y0:y1,x0:x1]),axis=-1)
        smoke_repeats.append({'times':[first,second],'exactRepeat':bool((delta==0).all()),'meanChange':float(delta.mean()),'changed8Fraction':float((delta>=8).mean())})
result={'warning':__doc__,'baseline':baseline_label,'regions':metrics,'planetRemoval':planet_checks,'leftSmokeEightSecondRepeats':smoke_repeats}
(folder / 'analysis.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
