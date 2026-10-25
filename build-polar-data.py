"""Map Polar Station animation onto its original, unmodified photograph."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json
import statistics

root = Path(__file__).resolve().parent
image = Image.open(root / 'assets/polar.png').convert('RGB')
width, height = image.size

def points(values):
    return [[round(x / width, 6), round(y / height, 6)] for x, y in values]

# Measured pane interiors, excluding the metal mullions and exterior lamps.
panes = [
    (1029,529,1035,541),(1038,532,1043,543),(1045,533,1049,544),
    (1060,534,1066,547),(1068,535,1074,548),(1076,537,1081,549),
    (1083,537,1088,550),(1090,538,1095,551),
    (1183,559,1193,580),
    (1338,551,1345,565),(1348,552,1354,566),
    (1360,552,1375,568),(1377,554,1391,571),(1393,556,1406,573),
    (1443,561,1454,576),(1456,561,1467,576),(1469,560,1481,575),
    (1497,557,1507,573),(1510,557,1519,573),(1522,556,1532,572),
    (1442,611,1455,633),(1466,610,1478,633),
    (1580,602,1586,620),(1588,603,1593,620),
    (106,696,117,716),(106,723,117,740),
    (399,769,409,791),(400,804,409,828),
    # Service level under the balcony, tower doors, and distant rear huts.
    (1060,583,1074,601),(1080,582,1089,598),
    (1098,580,1107,596),(1109,579,1119,594),
    (1172,496,1180,509),(1182,497,1190,509),
    (1207,498,1215,510),(1220,497,1228,511),(1230,499,1238,511),
    (1242,498,1252,513),(1294,565,1302,584),
    (1442,490,1452,508),(1518,626,1527,643),
    (1563,606,1572,621),(1611,509,1620,520),(1640,506,1650,518),
    # Small original work lights across the pier and service entrance.
    (969,520,976,530),(756,574,763,585),(921,576,928,586),
    (1013,607,1022,619),(1023,615,1038,638),(1241,540,1248,552),
]
windows = []
for x0, y0, x1, y1 in panes:
    selected = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = image.getpixel((x, y))
            if r > 100 and g > 55 and r > g * 1.08 and g > b * 1.12:
                selected.append((x, y))
    if len(selected) < 3:
        continue
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    runs = []
    for y in range(y0, y1):
        xs = sorted(x for x, row in selected if row == y)
        if not xs:
            continue
        start = previous = xs[0]
        for x in xs[1:] + [xs[-1] + 2]:
            if x > previous + 1:
                runs.append([start - cx, y - cy, previous - start + 1, 1])
                start = x
            previous = x
    colors = [image.getpixel(p) for p in selected]
    window=dict(x=cx/width, y=cy/height, w=x1-x0, h=y1-y0,
        color=[round(statistics.mean(c[i] for c in colors)) for i in range(3)],
        offColor=[27,35,43] if cy < 650 else [21,27,32], maskRects=runs)
    if (x0,y0,x1,y1) in panes[-6:]:
        ring=[]
        for yy in range(max(0,y0-5),min(height,y1+5)):
            for xx in range(max(0,x0-5),min(width,x1+5)):
                distance=max(x0-xx,xx-(x1-1),y0-yy,yy-(y1-1))
                if not 3 <= distance <= 5:
                    continue
                r,g,b=image.getpixel((xx,yy))
                if not (r > 100 and g > 55 and r > g*1.08 and g > b*1.12):
                    ring.append((r,g,b))
        if ring:
            window['offColor']=[round(statistics.median(c[i] for c in ring)) for i in range(3)]
        window.update(kind='worklight',minLight=.35)
    windows.append(window)

def water(poly, x, y, w, h, color, phase):
    return dict(polygon=points(poly), x=x/width, y=y/height, w=w/width, h=h/height, color=color, phase=phase)

def row_runs(pixels, cx, cy):
    runs = []
    for y in sorted({p[1] for p in pixels}):
        xs = sorted(x for x, row in pixels if row == y)
        first = previous = xs[0]
        for x in xs[1:] + [xs[-1] + 2]:
            if x > previous + 1:
                runs.append([first-cx, y-cy, previous-first+1, 1])
                first = x
            previous = x
    return runs

# Existing red lamps only: top and two side lamps of the left mast,
# plus the right-hand side lamp. The top of the right mast is unlit.
beacons = []
for index, (x, y, radius, period) in enumerate([(1213,386,10,2.9),(1202,419,5,3.3),(1221,420,6,3.3),(1335,422,7,3.8)]):
    selected, ring = [], []
    for yy in range(y-radius-3, y+radius+4):
        for xx in range(x-radius-3, x+radius+4):
            distance = ((xx-x)**2+(yy-y)**2)**.5
            r, g, b = image.getpixel((xx, yy))
            if distance <= radius and ((r > g*1.10 and r > b*1.02) or (r > 180 and g > 90 and r > b*1.2)):
                selected.append((xx, yy))
            elif radius <= distance <= radius+3 and r < g*1.15:
                ring.append((r,g,b))
    off = [round(statistics.median(c[i] for c in ring)) for i in range(3)]
    beacons.append(dict(x=x,y=y,radius=1.1 if index==1 else 1.6,coreRadius=1.1 if index==1 else 1.6,haloRadius=radius,
        color=[255,81,51],offColor=off,period=period,phase=index*.73,
        strength=.38 if index==1 else 1,maskRects=row_runs(selected,x,y)))

# Detect actual photographed star cores above the mountains. A local median
# rejects the smooth blue-hour gradient; each point retains its source pixels.
sky_background = image.filter(ImageFilter.MedianFilter(5))
star_pixels = set()
for y in range(5, 211):
    for x in range(5, width-5):
        pixel = image.getpixel((x,y)); background = sky_background.getpixel((x,y))
        if sum(pixel)-sum(background) > 27 and max(pixel[i]-background[i] for i in range(3)) > 11:
            star_pixels.add((x,y))
star_groups = []
while star_pixels:
    first = min(star_pixels); star_pixels.remove(first)
    todo, component = [first], []
    while todo:
        x,y = todo.pop(); component.append((x,y))
        for dx,dy in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)):
            p=(x+dx,y+dy)
            if p in star_pixels:
                star_pixels.remove(p);todo.append(p)
    if not 1 <= len(component) <= 10:
        continue
    x,y=max(component,key=lambda p:sum(image.getpixel(p))-sum(sky_background.getpixel(p)))
    contrast=sum(image.getpixel((x,y)))-sum(sky_background.getpixel((x,y)))
    star_groups.append((contrast,x,y,component))
stars=[]
for contrast,x,y,component in sorted(star_groups,reverse=True):
    if any((x-s['x'])**2+(y-s['y'])**2 < 70 for s in stars):
        continue
    background=list(sky_background.getpixel((x,y)))
    original=[]
    for yy in range(y-2,y+3):
        for xx in range(x-2,x+3):
            pixel=image.getpixel((xx,yy));base=sky_background.getpixel((xx,yy))
            if sum(pixel)-sum(base)>7:
                original.append([xx-x,yy-y,*pixel])
    stars.append(dict(x=x,y=y,radius=.55 if len(component)<3 else .8,color=list(image.getpixel((x,y))),
        backgroundColor=background,originalPixels=original,
        period=3.6+((x*19+y*7)%510)/100,phase=((x*31+y*17)%628)/100,
        strength=.12+((x+y)%13)/100))
    if len(stars)>=66:
        break

# The full visible fjord, inset from shore, pier and station structures.
# Renderers feather this mask inward before applying subpixel photo motion.
water_surface=[dict(polygon=[
    [0,454],[282,449],[549,449],[805,447],[1041,449],[1040,490],
    [1012,502],[1009,527],[946,532],[920,547],[893,551],[866,566],
    [814,570],[814,542],[767,542],[767,574],
    [688,578],[674,594],[676,631],[744,640],[862,653],[953,676],
    [1026,698],[1104,718],[1200,754],[1340,790],[1484,812],[1672,821],
    [1672,893],[1618,895],[1574,899],[1526,907],[1490,914],[1483,925],
    [1452,925],[1410,928],[1360,935],
    [1328,923],[1290,912],[1240,906],[1205,887],[1160,880],[1135,857],
    [1097,855],[1083,835],[1053,842],[1013,825],[970,822],[939,816],
    [888,798],[855,796],[832,788],[799,783],[774,774],[741,774],
    [708,762],[682,755],[645,747],[616,737],[587,730],[559,720],
    [523,714],[496,695],[463,695],[436,683],[410,678],[382,667],
    [347,655],[310,647],[279,649],[243,639],[208,642],[173,650],
    [150,643],[150,508],[108,508],[108,591],[87,588],[80,568],[51,554],[30,549],[0,546],
],feather=18,amplitude=.70,period=9.5,phase=.4)]

people=[
    dict(points=[[703,594],[742,598],[779,603],[812,607]],height=14,speed=3.2,phase=.17,workStops=[0,3],color=[47,61,72]),
    dict(points=[[889,603],[902,605],[908,609]],height=13,speed=2.2,phase=.63,workStops=[1,2],color=[134,92,57]),
    dict(points=[[1136,582],[1176,585],[1210,590],[1252,595],[1284,598]],height=14,speed=3.3,phase=.39,workStops=[0,4],color=[48,65,79]),
    dict(points=[[1393,635],[1420,640],[1451,644],[1488,650]],height=16,speed=2.6,phase=.74,workStops=[0,3],color=[60,76,86]),
    dict(points=[[1536,650],[1554,652],[1570,651]],height=15,speed=2.0,phase=.22,workStops=[0,2],color=[133,90,55]),
]

data = dict(
    IMAGE_WIDTH=width, IMAGE_HEIGHT=height,
    SKY_POLYGON=points([(0,0),(1672,0),(1672,194),(1625,188),(1607,220),
        (1586,241),(1529,237),(1504,228),(1482,231),(1462,247),(1443,278),
        (1428,292),(1400,294),(1377,309),(1354,296),(1325,278),(1304,290),
        (1280,305),(1253,299),(1224,301),(1193,276),(1173,253),(1148,265),
        (1113,277),(1097,269),(1077,290),(1044,300),(1018,307),(996,316),
        (964,307),(944,294),(927,281),(889,281),(871,271),(850,284),
        (832,278),(807,267),(785,257),(752,238),(731,254),(702,259),
        (669,267),(650,306),(634,314),(609,311),(590,326),(567,334),
        (548,327),(528,332),(507,326),(474,309),(446,321),(430,324),
        (411,349),(384,350),(359,359),(332,360),(312,350),(295,340),
        (272,345),(252,346),(227,354),(212,346),(194,324),(179,292),
        (156,264),(127,273),(110,258),(101,241),(80,248),(57,245),(42,224),(0,224)]),
    AURORA=[
        dict(left=.09,right=.94,y=.190,height=.140,phase=.3,speed=.085,color=[92,226,183],opacity=.32),
        dict(left=.22,right=.98,y=.145,height=.108,phase=2.2,speed=.061,color=[85,187,235],opacity=.23),
        dict(left=.18,right=.77,y=.106,height=.077,phase=4.4,speed=.073,color=[172,124,225],opacity=.13),
    ],
    WINDOWS=windows,
    BEACONS=beacons,
    STARS=stars,
    WATER_SURFACE=water_surface,
    PEOPLE=people,
    WATER=[
        water([(228,449),(436,449),(443,521),(303,559),(213,539)],300,494,155,80,[255,177,112],.7),
        water([(726,632),(796,639),(806,717),(724,715)],760,675,54,76,[255,184,100],1.8),
        water([(891,650),(943,658),(957,736),(890,733)],919,697,58,80,[255,180,92],3.1),
        water([(973,674),(1034,683),(1073,758),(988,753)],1015,717,66,76,[255,182,99],4.7),
        water([(1368,795),(1410,803),(1438,860),(1364,862)],1395,827,55,58,[246,186,116],2.4),
        water([(419,465),(657,464),(666,568),(460,575)],536,515,198,82,[111,157,193],5.4),
    ],
    AIRSHIPS=[dict(left=.2,right=.8,y=.13,width=45,period=160,phase=.31,direction=1)],
    SNOW=dict(count=220),
)

# A ridge-edge exclusion prevents snowy mountain glints from becoming stars.
sky_mask=Image.new('L',(width,height),0)
ImageDraw.Draw(sky_mask).polygon([(round(x*width),round(y*height)) for x,y in data['SKY_POLYGON']],fill=255)
sky_mask=sky_mask.filter(ImageFilter.MinFilter(15))
stars=[star for star in stars if sky_mask.getpixel((star['x'],star['y']))==255]
data['STARS']=stars

js='// Generated by build-polar-data.py from assets/polar.png.\n' + '\n'.join(
    f'export const {key} = {json.dumps(value,separators=(",", ":"))};' for key,value in data.items()) + '\n'
(root/'polar-data.json').write_text(json.dumps(data,indent=2)+'\n')
(root/'polar-data.js').write_text(js)
(root/'polar-data-browser.js').write_text('window.POLAR = '+json.dumps(data,separators=(',',':'))+';\n')
(root/'extension/nightfall@local/polar-data.js').write_text(js)
# Diagnostic copy only: the photograph itself is never overwritten.
diagnostic=image.copy();draw=ImageDraw.Draw(diagnostic)
for region in water_surface:
    draw.line([tuple(p) for p in region['polygon']]+[tuple(region['polygon'][0])],fill=(50,185,255),width=2)
for i,window in enumerate(windows):
    x,y=window['x']*width,window['y']*height
    draw.rectangle((x-window['w']/2-1,y-window['h']/2-1,x+window['w']/2+1,y+window['h']/2+1),outline=(255,207,80),width=1)
for i,beacon in enumerate(beacons):
    x,y,r=beacon['x'],beacon['y'],beacon['haloRadius']+2
    draw.ellipse((x-r,y-r,x+r,y+r),outline=(255,71,90),width=2)
    draw.text((x+r+2,y-5),f'B{i+1}',fill=(255,130,140))
for star in stars:
    x,y=star['x'],star['y'];draw.ellipse((x-3,y-3,x+3,y+3),outline=(140,205,255),width=1)
for i,person in enumerate(people):
    route=[tuple(p) for p in person['points']]
    draw.line(route,fill=(99,255,151),width=2)
    for x,y in route:draw.ellipse((x-2,y-2,x+2,y+2),fill=(99,255,151))
    draw.text((route[0][0]+3,route[0][1]+3),f'P{i+1} {person["height"]}px',fill=(137,255,166))
draw.rectangle((12,12,625,45),fill=(9,22,37))
draw.text((22,21),f'POLAR DATA: {len(windows)} window patches | {len(beacons)} beacons | {len(stars)} real stars | {len(people)} people routes',fill=(224,234,244))
diagnostic.save(root/'polar-data-diagnostic.png')
print(f'Polar data: {width}x{height}, {len(windows)} windows, {len(beacons)} beacons, {len(stars)} stars, {len(people)} people, {len(water_surface)} full-water mask.')
