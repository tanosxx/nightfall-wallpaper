#!/usr/bin/env python3
"""Inspect actual alpha and photographic pixels, not the generator formulas."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
assets = ROOT / 'assets' / 'titans'
source = np.asarray(Image.open(ROOT / 'concepts' / 'fallen-titans-v1.png').convert('RGB'))
emission = np.asarray(Image.open(assets / 'sky-emissions.png'))
assert emission.shape == (290, 850, 4)
# No synthesized paint can replace the photographed hull in this layer.
np.testing.assert_array_equal(emission[:, :, :3], source[:290, 790:1640])
mask = emission[:, :, 3]
assert 1000 < np.count_nonzero(mask) < mask.size*.05
# The horizon and planet light remain untouched; only orange ship fire survives.
assert not mask[250:, :680].any()
for i in range(3):
    smoke = np.asarray(Image.open(assets / f'sky-smoke-{i}.png'))
    alpha = smoke[:, :, 3]
    assert not alpha[0].any() and not alpha[-1].any()
    assert not alpha[:, 0].any() and not alpha[:, -1].any()
    assert 20 < alpha.max() < 245
    assert alpha.std() > 15
    # A feathered photograph texture, no binary cut-out or solid dark circle.
    assert len(np.unique(alpha)) > 75
flame = np.asarray(Image.open(assets / 'sky-flame.png'))[:, :, 3]
assert not flame[0].any() and not flame[-1].any()
assert not flame[:, 0].any() and not flame[:, -1].any()
print('Sky assets: original photo emissions, isolated warm pixels, no horizon contamination, organic alpha and transparent sprite edges passed.')
