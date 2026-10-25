"""Run after station-native.test.js; checks exported real Cairo frames."""
from PIL import Image, ImageChops

def picture(name, mode='RGB'):
    return Image.open('/tmp/nightfall-v10-' + name + '.png').convert(mode)

def changed(a, b, mode='RGB'):
    return sum(x != y for x, y in zip(picture(a, mode).get_flattened_data(), picture(b, mode).get_flattened_data()))

checks = {
    'pause': changed('station-pause-a', 'station-pause-b'),
    'break': changed('break-a', 'break-b', 'RGBA'),
    'behind_freighter': changed('station-no-actors', 'station-behind-freighter'),
}
assert checks['pause'] == 0
assert checks['break'] == 0
assert checks['behind_freighter'] == 0
assert picture('forced-worker', 'RGBA').getbbox() is not None
stars_a = picture('station-0').crop((600, 0, 900, 100))
stars_b = picture('station-15').crop((600, 0, 900, 100))
assert ImageChops.difference(stars_a, stars_b).getbbox() is None
for layer in ('lights', 'beacons', 'hangar', 'workers'):
    checks[layer + '_moving_pixels'] = changed(layer + '-0', layer + '-15', 'RGBA')
    assert checks[layer + '_moving_pixels'] > 0
# The isolated activity is clipped to the visible aperture: no activity in space.
box = picture('hangar-15', 'RGBA').getbbox()
assert box[0] >= 1053 and box[1] >= 548 and box[2] <= 1390 and box[3] <= 734
spark_box = picture('welding', 'RGBA').getbbox()
assert spark_box and spark_box[0] > 1140 and spark_box[2] < 1328 and spark_box[1] > 620 and spark_box[3] < 680
print(checks)
print('PASS: exact pause and break; worker hidden by parked freighter; fixed stars; animated actor/light layers; all work remains in hangar, welding is local.')

assert changed('station-night-pause-a', 'station-night-pause-b') == 0
for a, b in [('shift', 'night'), ('night', 'service'), ('shift', 'service')]:
    pixels = changed('station-' + a, 'station-' + b)
    assert pixels > 100000, (a, b, pixels)
    print('Mode difference', a, b, pixels)
    stars_a = picture('station-' + a).crop((600, 0, 900, 100))
    stars_b = picture('station-' + b).crop((600, 0, 900, 100))
    assert ImageChops.difference(stars_a, stars_b).getbbox() is None
weld = changed('relief-weld-off', 'relief-weld-on')
assert weld > 100
print('Normal-based local weld reflection changed pixels:', weld)
print('PASS: modes visibly relight station, stars unchanged, relit occluders retain exact pause; weld light changes adjacent surfaces.')

scan = changed('scan-a', 'scan-b')
assert scan > 1000
print('Inspection scan moves across surface pixels:', scan)

plate=picture('night-plate','RGBA')
cutout=picture('night-occluders','RGBA')
checked=0
for p,c in zip(plate.get_flattened_data(),cutout.get_flattened_data()):
    if c[3]==255:
        assert p[:3]==c[:3]
        checked+=1
assert checked>10000
print('Relit night cutouts exactly match plate:',checked,'opaque pixels')
