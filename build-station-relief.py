"""Measured 2.5D station surfaces and matching portable Cairo light responses.

The original photograph is never changed. Broad surface normals come from
measured hull/facet geometry; luminance only contributes a bounded micro-normal.
Run with Python + Pillow + numpy (Codex's bundled Python includes both).
"""
from pathlib import Path
import hashlib
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets/station-relief'
EXT_ASSETS = ROOT / 'extension/nightfall@local/assets/station-relief'
ASSETS.mkdir(parents=True, exist_ok=True)
EXT_ASSETS.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets/station.png'
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
source = Image.open(SOURCE).convert('RGB')
W, H = source.size
data = json.loads((ROOT / 'station-data.json').read_text())
rgb = np.asarray(source, dtype=np.float32) / 255
Y, X = np.mgrid[0:H, 0:W].astype(np.float32)


def polygon(points):
    im = Image.new('L', (W * 2, H * 2))
    ImageDraw.Draw(im).polygon([(round(x * 2), round(y * 2)) for x, y in points], fill=255)
    return np.asarray(im.resize((W, H), Image.Resampling.LANCZOS), dtype=np.float32) / 255


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-8)


def image_array(a):
    return Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255 + .5))


def rgba(alpha, color=(180 / 255, 207 / 255, 232 / 255)):
    out = np.zeros((*alpha.shape, 4), dtype=np.float32)
    out[..., :3] = color
    out[..., 3] = np.clip(alpha, 0, 1)
    return image_array(out)


ring_piece = data['HULL_MASK'][0]
ring = polygon(ring_piece['polygon'])
for hole in ring_piece['holes']:
    ring *= 1 - polygon(hole)
spine = np.zeros((H, W), dtype=np.float32)
for piece in data['HULL_MASK'][1:]:
    m = polygon(piece['polygon'])
    for hole in piece['holes']:
        m *= 1 - polygon(hole)
    spine = np.maximum(spine, m)
mask = np.maximum(ring, spine)
# A conservative two-pixel inset avoids spilling a light layer over stars at
# an approximate silhouette. This does not threshold away dark hull material.
mask = np.asarray(image_array(mask).filter(ImageFilter.MinFilter(3)), dtype=np.float32) / 255
aperture = polygon(data['DOCKS'][0]['aperture']) * mask

# Faceted ring: curved outer sides, inward-facing window wall, broad roof plates.
theta = np.arctan2((Y - 407) / 275, (X - 1002) / 605)
radial_x, radial_y = np.cos(theta), np.sin(theta)
normal = normalize(np.dstack((radial_x * .76, -radial_y * .31, np.full((H, W), .70))))
roughness = np.full((H, W), .58, dtype=np.float32)
depth = np.clip(.17 + (Y - 195) / 590 * .72, .08, .95)
facets = []


def facet(name, points, n, rough, sector='ring', depth_value=None, limit=None):
    global normal, roughness, depth
    m = polygon(points) * mask
    if limit is not None:
        m *= limit
    vector = normalize(np.asarray(n, dtype=np.float32))
    normal = normalize(normal * (1 - m[..., None]) + vector * m[..., None])
    roughness = roughness * (1 - m) + rough * m
    if depth_value is not None:
        depth = depth * (1 - m) + depth_value * m
    facets.append(dict(id=name, polygon=points, normal=[round(float(v), 5) for v in vector],
                       roughness=rough, sector=sector))
    return m


roof = [[405,453],[420,405],[468,363],[536,315],[635,271],[752,239],
 [879,215],[1015,201],[1134,202],[1240,222],[1348,260],[1445,310],
 [1515,370],[1552,419],[1534,448],[1478,481],[1383,518],[1276,551],
 [1156,578],[1040,592],[923,603],[849,611],[731,589],[618,560],
 [526,527],[456,488]]
roof_mask = polygon(roof) * ring * (1 - spine)
roof_n = normalize(np.dstack((radial_x * .24 - .05,
                             .70 - .06 * radial_y,
                             .70 + .05 * radial_y)))
normal = normalize(normal * (1 - roof_mask[..., None]) + roof_n * roof_mask[..., None])
roughness = roughness * (1 - roof_mask) + .37 * roof_mask
facets.append(dict(id='curved-ring-roof', polygon=roof, normal='analytic gently curved roof', roughness=.37, sector='ring'))

inner_wall = [[552,356],[661,301],[793,265],[950,242],[1106,239],
 [1215,263],[1300,301],[1360,350],[1392,399],[1365,432],[1330,391],
 [1278,354],[1206,324],[1117,304],[1021,296],[920,300],[816,314],
 [722,339],[650,375],[604,421],[582,431]]
inner_m = polygon(inner_wall) * ring * (1 - spine)
inner_n = normalize(np.dstack((-radial_x * .53, np.full((H, W), -.43), np.full((H, W), .78))))
normal = normalize(normal * (1 - inner_m[..., None]) + inner_n * inner_m[..., None])
roughness = roughness * (1 - inner_m) + .59 * inner_m
facets.append(dict(id='inward-window-wall', polygon=inner_wall, normal='inward radial wall', roughness=.59, sector='ring'))

# The roof-to-wall break is measured from the rows of exterior windows.
facet('front-window-face', [[469,521],[564,558],[697,587],[824,610],
 [871,606],[881,694],[863,729],[754,711],[620,675],[533,624],[486,571]],
 [-.12,-.40,.91], .60, limit=ring * (1 - spine))
facet('hangar-roof-fascia', [[963,548],[1108,544],[1257,515],[1376,480],
 [1412,514],[1261,568],[1060,588],[972,590]], [.15,-.43,.89], .48,
 limit=ring * (1 - spine))
facet('right-ring-outer-face', [[1450,486],[1549,420],[1605,448],
 [1588,539],[1545,591],[1465,638],[1438,564]], [.71,-.25,.66], .55,
 limit=ring * (1 - spine))
facet('front-service-tower-roof', [[886,565],[954,561],[1003,583],
 [1006,624],[918,638],[890,619]], [-.12,.72,.68], .39)
facet('front-service-tower-face', [[918,638],[1006,624],[1007,738],
 [963,760],[919,740]], [-.08,-.13,.99], .48)
facet('front-service-tower-left', [[890,619],[918,638],[919,740],[887,713]], [-.80,.03,.60], .55)

# Central structure has a sloped dorsal deck and a different camera-facing side.
spine_center_y = np.interp(X, [670,800,960,1100,1230,1400,1610], [457,406,336,283,238,195,140])
spine_t = np.clip((Y - spine_center_y) / 47, 0, 1)
spine_n = normalize(np.dstack((-.20 + .41 * spine_t,
                              .76 - 1.11 * spine_t,
                              .64 + .27 * spine_t)))
normal = normalize(normal * (1 - spine[..., None]) + spine_n * spine[..., None])
roughness = roughness * (1 - spine) + (.38 + .19 * spine_t) * spine
depth = depth * (1 - spine) + np.clip(.32 + (Y - 110) / 470 * .40, .25, .77) * spine
facets.append(dict(id='spine-dorsal-and-flank', polygon=data['HULL_MASK'][1]['polygon'],
                   normal='measured dorsal ridge interpolation', roughness=[.38,.57], sector='spine'))
facet('tower-front', [[1305,73],[1345,69],[1367,113],[1374,158],
 [1353,183],[1292,187],[1290,139]], [-.20,.12,.97], .43, 'spine', .56)
facet('tower-side', [[1345,69],[1367,101],[1378,119],[1388,162],
 [1353,183],[1354,123]], [.78,.14,.61], .51, 'spine', .52)
facet('rear-spine-face', [[1363,202],[1493,152],[1607,117],
 [1617,165],[1549,209],[1458,242],[1370,264]], [.24,-.34,.91], .57, 'spine', .39)
for i, piece in enumerate(data['HULL_MASK'][2:4]):
    facet(f'truss-{i}', piece['polygon'], [-.10,.61,.79], .68, 'spine')
for i, piece in enumerate(data['HULL_MASK'][4:]):
    facet(f'solar-panel-{i}', piece['polygon'], [-.72,.06,.69], .76, 'spine', .30)

# The open bay is a recess with different floor and wall orientations. Its
# parked craft are solid local surfaces, not light-derived height features.
facet('hangar-rear-wall', data['HANGAR']['aperture'], [.20,-.10,.97], .71, 'hangar', .49)
facet('hangar-right-wall', [[1334,557],[1385,591],[1389,648],
 [1365,658],[1353,621]], [-.66,.10,.75], .65, 'hangar', .55)
for i, floor in enumerate(data['HANGAR']['floors']):
    facet(f'hangar-floor-{i}', floor, [.03,.61,.79], .67, 'hangar', .63)
for obj in data['HANGAR']['occluders']:
    points = obj['polygon']
    m = polygon(points) * mask
    ys = [p[1] for p in points]
    cut = min(ys) + (max(ys) - min(ys)) * .55
    t = np.clip((Y - cut) / 8, 0, 1)
    obj_n = normalize(np.dstack((np.full((H, W), -.19), .70 - 1.00 * t, .69 + .22 * t)))
    normal = normalize(normal * (1 - m[..., None]) + obj_n * m[..., None])
    roughness = roughness * (1 - m) + .43 * m
    depth = depth * (1 - m) + .72 * m
    facets.append(dict(id=obj['id'], polygon=points, normal='top to side bevel', roughness=.43, sector='hangar'))

# Very small high-frequency material response: capped at two degrees, without
# changing depth or treating large photographic shadows/highlights as terrain.
lum = np.sum(rgb * [ .2126, .7152, .0722 ], axis=-1)
soft = np.asarray(image_array(lum).filter(ImageFilter.GaussianBlur(1.05)), dtype=np.float32) / 255
gy, gx = np.gradient(soft)
micro_x = np.clip(-gx * .18, -.025, .025)
micro_y = np.clip(gy * .18, -.025, .025)
normal[..., 0] += micro_x * mask
normal[..., 1] += micro_y * mask
normal = normalize(normal)
normal[mask == 0] = [0,0,1]
roughness = np.clip(roughness + (lum - soft) * .09, .30, .80)

# Window emission is protected. Large warm-lit floor regions are reflective,
# not emitters; only measured lamps/panes and tiny bright source pixels glow.
r,g,b = rgb[...,0],rgb[...,1],rgb[...,2]
warm = (r > .46) & (g > .25) & (r > g * 1.04) & (g > b * 1.18)
emissive = warm.astype(np.float32) * (1 - aperture)
# Isolated cool points in a dark silhouette gap are stars, not station metal.
# Protect them as well as the measured lamps; this does not alter the plate.
local_lum = np.asarray(image_array(lum).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
isolated_points = (lum > .12) & (lum - local_lum > .07) & (local_lum < .13) & (r < g * 1.2)
emissive = np.maximum(emissive, isolated_points.astype(np.float32))
for lamp in data['STATION_LIGHTS'] + data['BEACONS']:
    for dx,dy,rw,rh in lamp.get('maskRects', []):
        x,y = round(lamp['x'] + dx), round(lamp['y'] + dy)
        emissive[y:y+round(rh),x:x+round(rw)] = 1
emissive = np.maximum(emissive, np.asarray(image_array(emissive).filter(ImageFilter.GaussianBlur(.65)), dtype=np.float32) / 255 * .64) * mask
roughness[mask == 0] = 1
depth *= mask
reflectance = np.clip(np.asarray(image_array(lum).filter(ImageFilter.GaussianBlur(.7)), dtype=np.float32) / 255 * 4, 0, 1)
image_array(normal * .5 + .5).save(ASSETS / 'normal.png')
image_array(np.dstack((mask,roughness,emissive,reflectance))).save(ASSETS / 'material.png')
image_array(depth).save(ASSETS / 'depth.png')
dark_alpha = mask * (1 - emissive)
rgba(dark_alpha, (0,0,0)).save(ASSETS / 'dark.png')

# Sector masks form a partition; no light is allowed outside the station.
hangar_sector = aperture
spine_sector = np.minimum(mask - hangar_sector, spine * mask)
ring_sector = np.maximum(0, mask - hangar_sector - spine_sector)
sectors = []
for name, sector in [('ring',ring_sector),('spine',spine_sector),('hangar',hangar_sector)]:
    path = f'sector-{name}.png'
    rgba(sector, (1,1,1)).save(ASSETS / path)
    sectors.append(dict(id=name,path=path))

directions, layers, responses = [], [], []
for i in range(12):
    azimuth = i * math.tau / 12
    light = np.array([math.cos(azimuth) * math.sqrt(1-.58**2),
                      math.sin(azimuth) * math.sqrt(1-.58**2), .58], dtype=np.float32)
    half = normalize(light + [0,0,1])
    diffuse = np.maximum(0, np.sum(normal * light, axis=-1))
    specular = np.maximum(0, np.sum(normal * half, axis=-1)) ** (44 * (1-roughness) + 7 * roughness)
    response = dark_alpha * reflectance * np.clip(.62 * diffuse + .65 * specular * (1-roughness) * .4, 0, 1)
    path = f'light-{i:02d}.png'
    rgba(response).save(ASSETS / path)
    directions.append([round(float(v),8) for v in light])
    layers.append(path)
    responses.append(response)

welds = []
for i, welder in enumerate(data['HANGAR']['welders']):
    wx,wy = welder['tool']
    x0,y0,x1,y1 = max(0,wx-44),max(0,wy-40),min(W,wx+45),min(H,wy+41)
    dx,dy = wx-X,Y-wy
    # Normal-dependent point light on adjacent floor and metal. The local
    # source sits just above the tool's surface, so it grazes vertical panels.
    dz = 11 + (depth[wy,wx] - depth) * 34
    vector = normalize(np.dstack((dx,dy,np.maximum(3,dz))))
    diffuse = np.maximum(0, np.sum(normal * vector, axis=-1))
    distance = np.sqrt(dx*dx + dy*dy + dz*dz)
    response = dark_alpha * reflectance * aperture * np.exp(-distance / 16) * diffuse * 1.8
    response *= np.clip((45 - np.hypot(dx,dy)) / 10, 0, 1)
    path = f'weld-{i}.png'
    rgba(response[y0:y1,x0:x1], (182/255,222/255,1)).save(ASSETS / path)
    welds.append(dict(id=welder['id'],path=path,x=x0,y=y0,width=x1-x0,height=y1-y0,
                      source=[wx,wy],pointHeight=11,falloff=16))

metadata = dict(version=1,width=W,height=H,coordinates='source-pixels',
 normal='normal.png',material='material.png',depth='depth.png',dark='dark.png',
 normalConvention=dict(encoding='rgb = (normal + 1) / 2',x='right',y='up',z='toward-camera'),
 materialChannels=dict(r='station-mask',g='roughness',b='emissive-protection',a='source-reflectance'),
 directions=directions,layers=layers,sectors=sectors,welds=welds,
 response=dict(diffuse=.62,specular=.65,metal=.4,exponent=[44,7],reflectance='material.a'),
 keyColor=[180/255,207/255,232/255],microNormalMaximum=.025,
 sourceSha256=source_hash,facets=facets)
metadata['files'] = ['normal.png','material.png','depth.png','dark.png',*layers,
                    *[s['path'] for s in sectors],*[w['path'] for w in welds],'lighting.json']
serialized = json.dumps(metadata,separators=(',',':'))
(ASSETS / 'lighting.json').write_text(json.dumps(metadata,indent=2)+'\n')
(ROOT / 'station-relief-data.json').write_text(json.dumps(metadata,indent=2)+'\n')
module = '// Generated by build-station-relief.py. Paths are relative to assets/station-relief/.\nexport const STATION_RELIEF = '+serialized+';\n'
(ROOT / 'station-relief-data.js').write_text(module)
(ROOT / 'station-relief-data-browser.js').write_text('window.STATION_RELIEF = '+serialized+';\n')
(ROOT / 'extension/nightfall@local/station-relief-data.js').write_text(module)
for name in metadata['files']:
    shutil.copyfile(ASSETS / name, EXT_ASSETS / name)

# Diagnostics are generated artifacts, not changes to the source photograph.
diagnostic = source.copy();draw = ImageDraw.Draw(diagnostic)
for i, f in enumerate(facets):
    color = [(98,211,255),(255,193,92),(157,245,151),(223,143,246)][i % 4]
    pts = [tuple(p) for p in f['polygon']]
    draw.line(pts+[pts[0]],fill=color,width=1)
draw.rectangle((15,15,930,47),fill=(8,14,23))
draw.text((25,25),'STATION 2.5D | measured roof / wall / floor facets | bounded micro-normals | stars excluded',fill=(240,244,250))
diagnostic.save(ROOT / 'station-relief-diagnostic.png')
tiles=[]
for i,label in [(1,'key upper right'),(4,'key upper left'),(7,'key lower left'),(10,'key lower right')]:
    shade = rgb * (1 - .34 * dark_alpha[...,None])
    alpha = responses[i] * .40
    shade = shade * (1-alpha[...,None]) + np.array(metadata['keyColor']) * alpha[...,None]
    tile = image_array(shade).resize((836,471),Image.Resampling.LANCZOS)
    d=ImageDraw.Draw(tile);d.rectangle((10,10,180,35),fill=(8,14,23));d.text((18,18),label,fill=(240,244,250))
    tiles.append(tile)
montage = Image.new('RGB',(1672,942))
for i,tile in enumerate(tiles):montage.paste(tile,((i%2)*836,(i//2)*471))
montage.save(ROOT / 'station-relief-montage.jpg',quality=94)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
print(json.dumps(dict(size=[W,H],facets=len(facets),files=len(metadata['files']),
                     stationPixels=int(np.sum(mask>.5)),lightAlphaMaximum=max(float(r.max()) for r in responses),
                     sourceSha256=source_hash)))
