"""Build matching browser/GJS scene coordinates from the unmodified city plate."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageStat
import json
import random
import statistics

root = Path(__file__).resolve().parent
image = Image.open(root / 'assets/city.png').convert('RGB')
width, height = image.size
rng = random.Random(94021)
lights = []
# Hand-inspected facade interiors. A component must be an actual illuminated
# pixel cluster within a facade; sky, fog banks, water and roads are excluded.
# The final value is the local quota, preserving coverage across the city.
facades = [
    (204,258,238,424,17), (275,306,291,426,6), (305,337,315,424,4),
    (330,348,349,431,8), (411,192,423,315,5), (470,232,482,334,5),
    (485,287,499,362,5), (424,336,439,378,4), (504,397,519,451,5),
    (526,404,542,459,5), (593,366,606,441,6), (682,305,704,389,7),
    (775,312,791,375,5), (803,295,820,369,5), (862,347,877,389,4),
    (1050,273,1066,333,4), (1090,369,1111,445,6),
    (1294,278,1308,367,6), (1338,204,1352,317,6), (1489,177,1509,272,5),
    (1176,249,1190,419,10), (1194,262,1222,477,15), (1258,319,1285,473,9),
    (1390,183,1413,446,14), (1430,325,1478,452,14),
    (1550,264,1582,472,14), (1643,192,1668,470,15),
    (344,508,379,614,12), (388,509,429,567,9), (413,579,428,653,7),
    (437,468,463,630,8), (539,529,559,597,8), (615,551,641,654,7),
    (711,636,742,754,10), (795,561,822,646,5), (956,568,977,672,7),
    (998,479,1033,548,6), (1009,570,1030,693,7), (1098,389,1123,470,6),
    (1443,534,1464,609,6), (1482,570,1505,654,7), (1515,626,1542,754,10),
    (1582,581,1607,740,10), (1646,595,1670,779,11), (1268,823,1292,938,10),
]


def facade_components(region):
    x0, y0, x1, y1, quota = region
    pixels = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = image.getpixel((x, y))
            if max(r, g, b) > 151 and (r + g + b) > 345:
                pixels.add((x, y))
    candidates = []
    while pixels:
        first = min(pixels)
        pixels.remove(first)
        stack, component = [first], []
        while stack:
            x, y = stack.pop()
            component.append((x, y))
            for neighbour in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if neighbour in pixels:
                    pixels.remove(neighbour)
                    stack.append(neighbour)
        xs, ys = zip(*component)
        bw, bh = max(xs)-min(xs)+1, max(ys)-min(ys)+1
        if len(component) > 95 or bw > 14 or bh > 20:
            continue  # Broad neon/illumination is handled by mapped signs.
        # Anchor on the brightest real pixel, never in a hole of an L-shaped
        # component. Approximate only the small, connected window pane.
        x, y = max(component, key=lambda p: sum(image.getpixel(p)))
        r, g, b = image.getpixel((x, y))
        warm = r > b * 1.03
        color = ([255,191,109] if r > g * 1.23 else [255,215,145]) if warm else [150,218,235]
        candidates.append((x,y,max(1.3,min(4.2,bw*.8)),max(1.8,min(7.2,bh*.8)),color))
    rng.shuffle(candidates)
    selected = []
    for x,y,w,h,color in candidates:
        if all((x-a)**2+(y-b)**2 > 28 for a,b in selected):
            selected.append((x,y))
            lights.append(dict(x=x/width,y=y/height,w=w,h=h,color=color,
                phase=rng.uniform(0,30),period=rng.uniform(7,29),kind='window'))
        if len(selected) >= quota:
            break
    return len(selected)


facade_counts = [facade_components(region) for region in facades]
# The near-left ruin has large separated panes, unlike distant pinprick
# windows. These measured pane centres preserve the black mullions.
for x,y,w,h in [
    (113,183,5,9),(126,186,5,12),(112,211,5,9),(126,216,5,8),
    (112,265,5,13),(126,277,5,15),(111,319,5,15),(124,321,5,17),
    (111,346,5,16),(126,349,5,18),(112,404,5,11),(125,408,5,11),
    (112,427,5,11),(125,430,5,13),(24,602,7,19),(40,604,6,18),
    (8,651,7,16),(23,653,7,16),(39,650,6,18),(42,674,6,9),
]:
    lights.append(dict(x=x/width,y=y/height,w=w,h=h,color=[255,185,99],
        phase=rng.uniform(0,30),period=rng.uniform(9,30),kind='window'))


def points(pixel_points):
    return [[round(x/width,6),round(y/height,6)] for x,y in pixel_points]


def road(pixel_points, period, count, color=(255,193,120)):
    return dict(points=points(pixel_points),period=period,count=count,color=list(color))


def water(pixel_points, rate, scale):
    return dict(polygon=points(pixel_points),rate=rate,scale=scale)


def smoke(x,y,spread,rise,rate,phase,color=(142,163,174)):
    return dict(x=x/width,y=y/height,spread=spread/width,rise=rise/height,
                color=list(color),rate=rate,phase=phase)
for x,y,w,h,color,phase in [(388,411,4,32,[94,233,255],1.3),
 (450,299,4,55,[102,232,255],4.1),(969,445,4,40,[91,219,245],7.7),
 (1178,451,7,46,[106,237,255],3.2),(1180,328,5,17,[108,232,249],6.6),
 (1426,251,4,88,[111,234,249],9.4),(872,596,5,65,[118,234,255],5.5),
 (1448,654,8,55,[133,236,252],11.5),(1565,601,3,42,[109,227,249],2.7)]:
    lights.append(dict(x=x/width,y=y/height,w=w,h=h,color=color,phase=phase,period=13+phase,kind='neon'))


def unlit_facade_color(light):
    """Sample local material/haze rather than painting every off pane black."""
    cx, cy = round(light['x'] * width), round(light['y'] * height)
    pane_w, pane_h = light['w'], light['h']
    near_pane = light['kind'] == 'window' and cx < 150 and pane_h >= 8
    samples = []
    # The annulus skips the actual lit pane and its immediate bright fringe.
    # Large foreground panes sample outside their bounds to reach the frame.
    reach_x = int(pane_w / 2 + 8) if near_pane else 8
    reach_y = int(pane_h / 2 + 8) if near_pane else 8
    for dy in range(-reach_y, reach_y + 1):
        for dx in range(-reach_x, reach_x + 1):
            if near_pane:
                outside = max(abs(dx) - pane_w / 2, abs(dy) - pane_h / 2)
                if not 1 <= outside <= 6:
                    continue
            else:
                if not 9 <= dx * dx + dy * dy <= 64:
                    continue
                if abs(dx) <= pane_w / 2 + 1 and abs(dy) <= pane_h / 2 + 1:
                    continue
            x, y = cx + dx, cy + dy
            if not (0 <= x < width and 0 <= y < height):
                continue
            rgb = image.getpixel((x, y))
            # Same emission threshold as component selection; adjacent window
            # cores must not contribute to the unlit wall estimate.
            if max(rgb) > 151 and sum(rgb) > 345:
                continue
            samples.append(rgb)
    if not samples:
        # Very bright haze can exceed the fixed threshold. A luminance median
        # of the outer ring remains safer than inventing a near-black fallback.
        samples = [image.getpixel((min(width-1,max(0,cx+dx)),
                                   min(height-1,max(0,cy+dy))))
                   for dx,dy in [(-8,-3),(-8,3),(8,-3),(8,3),(0,-8),(0,8)]]
    if near_pane:
        samples.sort(key=sum)
        samples = samples[:max(3, len(samples) // 2)]
    return [round(statistics.median(channel)) for channel in zip(*samples)]


for light in lights:
    x, y = light['x'] * width, light['y'] * height
    if light['kind'] == 'window' and 250 <= x <= 1140 and y < 450:
        light['w'] = min(3, light['w'])
        light['h'] = min(3, light['h'])
    light['offColor'] = unlit_facade_color(light)


def warm_window_patches():
    """Cover real warm photo emissions, including their connected glow."""
    # The existing facade interiors are augmented with complete near-left
    # panes and missing sides of foreground buildings. Roads/fire are omitted.
    regions = [r[:4] for r in facades] + [
        (103,169,134,476), (0,582,53,683), (105,476,131,652),
        (192,260,245,424), (413,554,430,656), (483,505,512,633),
        (652,580,679,702), (694,665,711,761),
        (1409,324,1478,474), (1454,557,1475,689),
        (1042,796,1064,914), (1113,792,1135,927),
    ]
    facade_pixels = {(x,y) for x0,y0,x1,y1 in regions
                     for y in range(y0,y1) for x in range(x0,x1)}
    def warm_core(x,y):
        r,g,b = image.getpixel((x,y))
        return r > 145 and r-b > 25 and r-g > 5
    cores = {p for p in facade_pixels if warm_core(*p)}
    patches = []
    while cores:
        first = min(cores)
        cores.remove(first)
        stack, component = [first], []
        while stack:
            x,y = stack.pop()
            component.append((x,y))
            for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if q in cores:
                    cores.remove(q)
                    stack.append(q)
        if len(component) < 2:
            continue
        xs,ys = zip(*component)
        x0,y0,x1,y1 = min(xs),min(ys),max(xs),max(ys)
        # A broad connected facade glow can include several adjacent panes;
        # the run mask still retains its dark mullions and irregular shape.
        if x1-x0 > 42 or y1-y0 > 72 or len(component) > 1100:
            continue
        near = x0 < 150
        dilation = 2 if near or len(component) > 24 else 1
        mask = set()
        for x,y in component:
            for dy in range(-dilation,dilation+1):
                for dx in range(-dilation,dilation+1):
                    q = (x+dx,y+dy)
                    if dx*dx+dy*dy <= dilation*dilation and q in facade_pixels:
                        mask.add(q)
        mx,my = zip(*mask)
        left,top,right,bottom = min(mx),min(my),max(mx)+1,max(my)+1
        cx,cy = (left+right)/2,(top+bottom)/2
        # Merge identical runs over adjacent scanlines. This gives exact
        # irregular pane masks with far fewer canvas/Cairo rectangle calls.
        rectangles, previous = [], {}
        for y in range(top,bottom):
            row = sorted(x for x in range(left,right) if (x,y) in mask)
            runs=[]
            for x in row:
                if runs and x == runs[-1][1]:
                    runs[-1][1] += 1
                else:
                    runs.append([x,x+1])
            current={}
            for a,b in runs:
                key=(a,b)
                if key in previous:
                    index=previous[key]
                    rectangles[index][3] += 1
                else:
                    index=len(rectangles)
                    rectangles.append([a-cx,y-cy,b-a,1])
                current[key]=index
            previous=current
        surroundings=[]
        for y in range(max(0,top-7),min(height,bottom+7)):
            for x in range(max(0,left-7),min(width,right+7)):
                if left-1 <= x <= right+1 and top-1 <= y <= bottom+1:
                    continue
                rgb=image.getpixel((x,y))
                if max(rgb)>151 and sum(rgb)>345:
                    continue
                surroundings.append(rgb)
        if near:
            surroundings.sort(key=sum)
            surroundings=surroundings[:max(3,len(surroundings)//2)]
        off=[round(statistics.median(c)) for c in zip(*surroundings)] if surroundings else [31,43,49]
        source_color=[round(statistics.median(c)) for c in zip(*(image.getpixel(p) for p in component))]
        patches.append(dict(x=cx/width,y=cy/height,w=right-left,h=bottom-top,
            color=source_color,offColor=off,phase=rng.uniform(0,30),
            period=rng.uniform(8,30),kind='window',sourceWindow=True,
            maskRects=rectangles))
    return patches


# Source-photo warm windows replace tiny sampled overlays. Cool facade lights
# and mapped neon strips retain their existing treatment.
lights = [v for v in lights if v['kind']=='neon' or v['color'][0] <= v['color'][2]] + warm_window_patches()


def photo_smoke(pixel_polygon,direction,period,feather=18):
    xs,ys=zip(*pixel_polygon)
    return dict(polygon=points(pixel_polygon),
                bbox=[min(xs)/width,min(ys)/height,(max(xs)-min(xs))/width,(max(ys)-min(ys))/height],
                direction=direction,period=period,feather=feather)


def sky_color_rows(polygon):
    """Match the scrolling 1400x360 sky tile to the original atmosphere."""
    tile = image.crop((440,0,1140,180)).resize((1400,360),Image.Resampling.BILINEAR)
    source = [ImageStat.Stat(tile.crop((0,y,1400,y+1))).mean for y in range(360)]
    vertices = [(x*width,y*height) for x,y in polygon]
    polygon_mask = Image.new('L',(width,height),0)
    ImageDraw.Draw(polygon_mask).polygon(vertices,fill=255)
    mask, pixels = polygon_mask.load(), image.load()
    segments = []
    for a,b in zip(vertices,vertices[1:]+vertices[:1]):
        ax,ay=a; bx,by=b
        dx,dy=bx-ax,by-ay
        segments.append((ax,ay,dx,dy,dx*dx+dy*dy,min(ay,by)-5,max(ay,by)+5))
    target = []
    for y in range(360):
        py=y+.5
        nearby=[s for s in segments if s[5] <= py <= s[6]]
        total=[0,0,0]
        count=0
        for x in range(width):
            if not mask[x,y]:
                continue
            px=x+.5
            clear=True
            for ax,ay,dx,dy,length2,_,_ in nearby:
                t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/length2)) if length2 else 0
                if (px-ax-t*dx)**2+(py-ay-t*dy)**2 <= 25:
                    clear=False
                    break
            if clear:
                rgb=pixels[x,y]
                for channel in range(3):
                    total[channel] += rgb[channel]
                count += 1
        target.append([v/count for v in total] if count else None)
    # The first five rows sit on the polygon's top edge. Seed those from the
    # first real interior row, then carry the previous mean through empty rows.
    previous=next((row for row in target if row is not None),source[0])
    for index,row in enumerate(target):
        if row is None:
            target[index]=previous
        else:
            previous=row
    rows=[]
    for index,source_row in enumerate(source):
        neighbourhood=target[max(0,index-12):min(360,index+13)]
        smoothed=[sum(row[channel] for row in neighbourhood)/len(neighbourhood)
                  for channel in range(3)]
        rows.append(dict(target=[round(v,4) for v in smoothed],
                         source=[round(v,4) for v in source_row]))
    return rows

data = dict(
 IMAGE_WIDTH=width, IMAGE_HEIGHT=height,
 SKY_POLYGON=[[0.1525, 0], [1, 0], [1, 0.152], [0.9755, 0.152], [0.9665, 0.2189], [0.9569, 0.2306], [0.9169, 0.1902], [0.9061, 0.1509], [0.8834, 0.1488], [0.8762, 0.0871], [0.8254, 0.0744], [0.8176, 0.1817], [0.7907, 0.1849], [0.7835, 0.2614], [0.7572, 0.2678], [0.7416, 0.2317], [0.7392, 0.1456], [0.695, 0.1456], [0.6878, 0.2646], [0.6453, 0.2646], [0.64, 0.2497], [0.6232, 0.2497], [0.6172, 0.3082], [0.5945, 0.3071], [0.5861, 0.3358], [0.5323, 0.3316], [0.5197, 0.3209], [0.503, 0.3231], [0.4964, 0.2976], [0.4647, 0.2933], [0.4492, 0.3071], [0.4276, 0.3103], [0.4211, 0.2901], [0.4061, 0.2891], [0.4031, 0.3209], [0.3648, 0.3039], [0.3577, 0.2604], [0.3409, 0.2604], [0.3337, 0.3018], [0.3248, 0.2965], [0.3182, 0.2699], [0.3032, 0.2614], [0.2967, 0.2147], [0.2769, 0.2062], [0.2697, 0.2242], [0.259, 0.2168], [0.2566, 0.1796], [0.2392, 0.1764], [0.2344, 0.2455], [0.2195, 0.2678], [0.1914, 0.2699], [0.1693, 0.2901], [0.1525, 0.2572]],
 LIGHTS=lights,
 TRAFFIC=[
  # Separate exposed spans stop at occluding towers. Opposing lanes use a
  # small image-space offset, rather than sending cars through buildings.
  road([(604,453),(697,449)],19,3,(147,224,246)),
  road([(733,448),(824,444),(935,438)],32,6),
  road([(935,441),(824,447),(733,451)],35,4,(255,137,94)),
  road([(802,412),(858,415),(921,420)],25,4,(160,221,238)),
  road([(560,563),(597,558)],12,2),
  road([(704,583),(791,574)],22,3),
  road([(813,520),(859,529)],14,2),
  road([(1066,482),(1147,493)],17,3,(147,224,246)),
  road([(1205,500),(1298,511),(1405,522)],29,5,(144,224,247)),
  road([(1405,525),(1298,514),(1205,503)],31,4,(255,169,103)),
  road([(1003,567),(1115,589),(1280,624),(1394,649)],44,11),
  road([(1394,653),(1280,628),(1115,593),(1003,571)],49,8,(255,139,91)),
  road([(766,672),(861,704),(964,736)],27,7,(255,202,139)),
  road([(964,740),(861,708),(766,676)],32,5,(151,221,241)),
  road([(1484,740),(1578,773),(1670,803)],29,7,(255,194,124)),
  road([(1305,853),(1364,875)],19,3,(157,220,239)),
 ],
 CLOUDS=[
  dict(x=.28,y=.055,rx=.22,ry=.10,speed=.0070,phase=0.4,opacity=.52),
  dict(x=.69,y=.095,rx=.27,ry=.11,speed=-.0058,phase=2.1,opacity=.45),
  dict(x=.44,y=.205,rx=.24,ry=.07,speed=.0064,phase=3.7,opacity=.43),
  dict(x=.83,y=.020,rx=.25,ry=.10,speed=.0055,phase=5.2,opacity=.50),
 ],
 REFLECTIONS=[
  dict(x=.514,y=.719,w=.024,h=.032,color=[98,207,236],phase=.8,polygon=[[.5012,.7024],[.5257,.7035],[.5257,.7365],[.5084,.7301]]),
  dict(x=.519,y=.814,w=.018,h=.055,color=[98,207,236],phase=2.7,polygon=[[.5138,.7853],[.5251,.7928],[.5269,.8427],[.5114,.8289]]),
  dict(x=.581,y=.865,w=.023,h=.082,color=[127,215,235],phase=4.7,polygon=[[.5682,.8183],[.5855,.8278],[.5921,.9097],[.5682,.8927]]),
  dict(x=.939,y=.885,w=.016,h=.065,color=[255,184,112],phase=5.1,polygon=[[.9330,.8555],[.9450,.8640],[.9468,.9214],[.9312,.9086]]),
  dict(x=.070,y=.842,w=.029,h=.032,color=[255,177,101],phase=3.8,polygon=[[.0586,.8278],[.0718,.8236],[.0873,.8480],[.0736,.8618],[.0544,.8555]]),
 ],
 SEARCHLIGHTS=[
  dict(x=.596,y=.556,length=.54,angle=-1.79,swing=.50,phase=1.3,period=12.5),
  dict(x=.796,y=.594,length=.57,angle=-1.93,swing=.50,phase=4.7,period=15.0),
  dict(x=.412,y=.460,length=.38,angle=-1.42,swing=.50,phase=2.8,period=10.5),
 ],
 WATER=[],
 RIVER=[
  # Explicit exposed water masks: no ripples on bridge decks or facades.
  water([(631,492),(655,492),(655,529),(633,539)],2.0,.30),
  water([(745,525),(781,530),(785,559),(744,567)],2.4,.38),
  water([(838,662),(902,661),(917,686),(879,696),(850,686)],3.0,.55),
  water([(844,726),(879,740),(887,792),(855,780)],3.0,.65),
  water([(887,732),(923,744),(969,761),(975,854),(969,877),(941,862),(915,845),(892,828),(880,806)],3.5,.75),
  water([(1387,787),(1469,797),(1481,841),(1411,849),(1378,827)],4.0,.85),
  water([(1548,800),(1600,817),(1597,862),(1553,854)],3.6,.90),
  # Broad exposed near-right reaches, beyond the bridge decks and piers.
  water([(1494,804),(1535,817),(1543,854),(1532,883),(1505,889),(1488,875),(1486,845)],3.6,.95),
  water([(1610,837),(1629,837),(1638,852),(1641,882),(1628,890),(1608,873)],3.0,1.0),
 ],
 PHOTO_SMOKE=[
  photo_smoke([(251,465),(274,450),(305,451),(328,466),(333,480),(322,493),(304,496),(280,485)],[-.42,-.9075],7.2,14),
  photo_smoke([(473,479),(494,466),(510,474),(533,476),(554,481),(585,481),(590,498),(571,511),(546,503),(520,504),(499,496)],[-.35,-.9367],7.8,16),
  photo_smoke([(988,354),(1010,346),(1032,356),(1036,376),(1027,399),(1006,404),(992,389)],[.24,-.9708],8.4,15),
  photo_smoke([(730,505),(747,492),(770,500),(782,525),(778,551),(760,569),(737,554),(725,529)],[-.24,-.9708],8.8,19),
  photo_smoke([(1285,539),(1300,531),(1311,543),(1312,574),(1302,593),(1285,582),(1279,560)],[-.39,-.9208],7.0,14),
  photo_smoke([(1485,481),(1502,452),(1531,460),(1541,484),(1564,491),(1592,488),(1617,505),(1601,529),(1581,548),(1552,552),(1531,540),(1504,539),(1487,520)],[-.55,-.8352],6.7,23),
  photo_smoke([(1608,483),(1633,468),(1658,476),(1672,469),(1672,544),(1646,550),(1621,532),(1599,516)],[-.47,-.8827],7.5,22),
  photo_smoke([(1040,659),(1060,646),(1080,653),(1086,678),(1077,707),(1057,713),(1042,696)],[-.18,-.9837],8.1,18),
  photo_smoke([(1302,780),(1323,765),(1335,773),(1353,788),(1388,779),(1401,802),(1383,824),(1351,834),(1323,823),(1305,808)],[-.32,-.9474],8.6,22),
 ],
 SMOKE=[
  # Origins sit inside existing steam/smoke banks; spread and rise are
  # normalized widths/heights, and rate is births per second.
  smoke(329,503,36,76,1.4,0.5),
  smoke(573,511,38,87,1.5,2.2),
  smoke(741,556,34,81,1.4,3.4),
  smoke(1007,421,51,103,1.5,4.8),
  smoke(1134,582,43,107,1.7,1.4,(174,166,151)),
  smoke(1514,552,63,130,1.8,5.2),
  smoke(1595,571,49,108,1.5,0.9),
  smoke(1042,701,39,96,1.5,3.0),
  smoke(1364,809,53,119,1.8,4.1),
 ])
data['SKY_COLOR_ROWS'] = sky_color_rows(data['SKY_POLYGON'])
(root / 'scene-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
esm = '// Generated by build-scene-data.py. Coordinates reference assets/city.png.\n'
esm += '\n'.join(f'export const {key} = {json.dumps(value,separators=(",", ":"))};' for key,value in data.items())+'\n'
(root / 'scene-data.js').write_text(esm)
(root / 'scene-data-browser.js').write_text('// Same scene coordinates as the GNOME module.\nwindow.NIGHTFALL = '+json.dumps(data,separators=(',',':'))+';\n')
native = root / 'extension/nightfall@local/scene-data.js'
native.write_text(esm)
print(f'Generated {len(lights)} facade lights, {len(data["TRAFFIC"])} traffic routes, '
      f'{len(data["RIVER"])} river polygons and {len(data["PHOTO_SMOKE"])} photo smoke regions.')
print('Source window patches:',sum(v.get('sourceWindow',False) for v in lights),
      'mask rectangles:',sum(len(v.get('maskRects',[])) for v in lights))
print('Facade coverage:', ', '.join(str(count) for count in facade_counts))
