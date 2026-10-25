"""Source-pixel mappings for the unmodified deep-space station photograph."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
import random
import statistics

root=Path(__file__).resolve().parent
image=Image.open(root/'assets/station.png').convert('RGB')
width,height=image.size
rng=random.Random(713109)

def mask_for(poly):
    mask=Image.new('L',(width,height),0)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in poly],fill=255)
    return mask

def runs(pixels,cx,cy):
    result=[]
    for y in sorted({y for x,y in pixels}):
        xs=sorted(x for x,row in pixels if row==y)
        first=previous=xs[0]
        for x in xs[1:]+[xs[-1]+2]:
            if x>previous+1:
                result.append([first-cx,y-cy,previous-first+1,1]);first=x
            previous=x
    return result

def warm(rgb):
    r,g,b=rgb
    return r>112 and g>65 and r>g*1.04 and g>b*1.16 and r-b>30

def local_dark(x0,y0,x1,y1):
    ring=[]
    for y in range(max(0,y0-4),min(height,y1+5)):
        for x in range(max(0,x0-4),min(width,x1+5)):
            if x0-1<=x<=x1+1 and y0-1<=y<=y1+1:continue
            rgb=image.getpixel((x,y))
            if not warm(rgb) and max(rgb)<175:ring.append(rgb)
    return [round(statistics.median(c[i] for c in ring)) for i in range(3)] if ring else [30,31,32]

# Actual glazed/window faces. The bright hangar floor and metal roof panels
# are intentionally absent from these masks.
facades=[
 ('back_ring',[[548,349],[663,288],[795,248],[951,222],[1104,216],[1182,232],[1162,292],[1010,293],[838,314],[695,359],[594,421],[566,429]],210),
 ('front_ring',[[468,517],[563,551],[699,580],[834,594],[882,559],[878,729],[755,712],[619,675],[531,622],[482,570]],190),
 ('dock_roof_face',[[968,547],[1110,544],[1259,515],[1376,479],[1413,515],[1260,568],[1060,588],[973,590]],80),
 ('right_ring',[[1416,415],[1513,370],[1561,391],[1607,438],[1588,542],[1545,594],[1465,640],[1441,564],[1477,518]],95),
 ('central_spine',[[686,454],[771,416],[884,372],[997,321],[1110,286],[1217,244],[1268,265],[1212,339],[1100,394],[995,438],[878,480],[770,494]],150),
 ('rear_spine',[[1228,204],[1296,162],[1304,96],[1343,68],[1369,127],[1452,132],[1538,111],[1603,105],[1613,158],[1549,211],[1458,242],[1361,262],[1271,258]],100),
 ('left_ring',[[438,389],[506,339],[568,330],[553,382],[520,427],[544,479],[519,502],[454,476],[418,453]],55),
]
lights=[];used=set();facade_counts={}
for name,poly,quota in facades:
    roi=mask_for(poly);candidates=set()
    x0,y0=min(x for x,y in poly),min(y for x,y in poly)
    x1,y1=max(x for x,y in poly),max(y for x,y in poly)
    for y in range(y0,y1+1):
        for x in range(x0,x1+1):
            if roi.getpixel((x,y)) and (x,y) not in used and warm(image.getpixel((x,y))):candidates.add((x,y))
    components=[]
    while candidates:
        first=min(candidates);candidates.remove(first);stack=[first];component=[]
        while stack:
            x,y=stack.pop();component.append((x,y))
            for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if q in candidates:candidates.remove(q);stack.append(q)
        xs,ys=zip(*component);bw=max(xs)-min(xs)+1;bh=max(ys)-min(ys)+1
        # A connected pane, not a whole bright strip or a lit deck.
        if 1<=len(component)<=30 and bw<=13 and bh<=10 and max(image.getpixel(p)[0] for p in component)>150:
            components.append(component)
    # Balanced coverage over each facade rather than collecting one bright end.
    buckets={}
    for c in components:
        x,y=c[0];buckets.setdefault((x//55,y//35),[]).append(c)
    for b in buckets.values():rng.shuffle(b)
    selected=[]
    while len(selected)<quota and any(buckets.values()):
        for key in sorted(buckets):
            if buckets[key]:selected.append(buckets[key].pop())
            if len(selected)>=quota:break
    for c in selected:
        used.update(c);xs,ys=zip(*c);x0,y0,x1,y1=min(xs),min(ys),max(xs),max(ys)
        cx,cy=(x0+x1+1)/2,(y0+y1+1)/2
        pixels=[image.getpixel(p) for p in c]
        lights.append(dict(x=cx,y=cy,w=x1-x0+1,h=y1-y0+1,kind='window',facade=name,
            color=[round(statistics.mean(p[i] for p in pixels)) for i in range(3)],
            offColor=local_dark(x0,y0,x1,y1),maskRects=runs(c,cx,cy),
            minLight=.07,period=round(rng.uniform(14,70),3),phase=round(rng.uniform(0,30),3)))
    facade_counts[name]=len(selected)

# A union of solid hull pieces. Only the annular body has a hole; the spine
# and trusses are added back after subtracting that opening.
outer_ring=[[403,453],[417,395],[455,354],[516,308],[605,267],[702,237],
 [804,216],[908,202],[1017,193],[1134,194],[1237,212],[1326,235],
 [1408,270],[1480,311],[1535,355],[1573,399],[1602,452],[1611,486],
 [1600,529],[1575,573],[1527,613],[1468,649],[1429,665],[1382,702],
 [1268,731],[1151,755],[1058,771],[976,770],[883,748],[784,734],
 [684,711],[595,678],[524,636],[469,590],[427,542],[404,498]]
inner_ring=[[599,425],[623,385],[669,351],[728,327],[806,309],[889,298],
 [979,292],[1071,292],[1156,309],[1233,330],[1290,358],[1335,388],
 [1363,418],[1368,438],[1338,458],[1289,477],[1218,490],[1132,499],
 [1041,502],[949,497],[860,487],[782,477],[710,457],[650,441]]
spine=[[668,467],[751,425],[840,392],[925,352],[983,319],[1020,298],
 [1017,186],[1043,183],[1045,287],[1100,264],[1164,246],[1217,211],
 [1267,171],[1284,133],[1299,116],[1306,66],[1346,62],[1367,102],
 [1378,119],[1425,120],[1474,115],[1531,99],[1605,95],[1613,112],
 [1591,127],[1634,144],[1615,172],[1563,192],[1548,218],[1518,228],
 [1493,251],[1446,264],[1399,266],[1356,280],[1318,283],[1284,302],
 [1234,334],[1196,359],[1152,379],[1118,395],[1066,413],[1018,434],
 [967,451],[914,475],[874,492],[790,502],[725,492]]
hull=[dict(polygon=outer_ring,holes=[inner_ring]),dict(polygon=spine,holes=[]),
 dict(polygon=[[729,325],[750,324],[957,373],[950,390],[917,383],[745,341]],holes=[]),
 dict(polygon=[[1098,393],[1114,391],[1307,438],[1304,457],[1124,416]],holes=[]),
 dict(polygon=[[1072,111],[1143,111],[1144,198],[1073,199]],holes=[]),
 dict(polygon=[[1557,230],[1645,246],[1640,394],[1555,376]],holes=[])]

dock=dict(id='main',aperture=[[1068,590],[1346,548],[1386,588],[1390,648],
 [1354,680],[1264,710],[1164,733],[1090,731],[1065,695],[1053,641]],
 frontLip=[[1085,724],[1115,740],[1190,730],[1282,710],[1389,680],
 [1392,693],[1284,727],[1188,746],[1117,756],[1088,739]],
 entry=[1340,680],berth=[1287,630])

beacons=[]
for i,(cx,cy) in enumerate([(1330,18),(1345,34),(1488,87),(1456,92),(1644,145),
 (1033,160),(1133,109),(1177,192),(631,240),(438,357),(569,694),
 (895,776),(1001,815),(1149,781),(1155,810),(1496,743),(1614,656),(1647,406),(1597,346),(1543,593)]):
    red=[]
    for y in range(max(0,cy-5),min(height,cy+6)):
        for x in range(max(0,cx-5),min(width,cx+6)):
            r,g,b=image.getpixel((x,y))
            if r>48 and r>g*1.65 and r>b*1.55:red.append((x,y))
    if not red:continue
    x,y=max(red,key=lambda p:image.getpixel(p)[0]-image.getpixel(p)[1])
    beacons.append(dict(x=x,y=y,coreRadius=1.1,radius=1.1,haloRadius=4.5,
        color=[255,92,52],offColor=local_dark(x-2,y-2,x+2,y+2),maskRects=runs(red,x,y),
        period=round(2.8+(i%5)*.47,2),phase=round(i*.71,2),strength=.65))

# Activity stays inside the existing hangar; external ship traffic is disabled.
routes=[]

# Paths are measured contact points on the deck, not centers of sprites.
# The broad floor outline is for reflected work-light, with machinery restored
# through occluders after actors and local lighting have been drawn.
floor=[[1098,598],[1168,588],[1200,584],[1240,594],[1292,608],
 [1337,626],[1369,649],[1361,666],[1311,686],[1245,708],
 [1160,729],[1100,733],[1080,705],[1078,654]]
occluders=[
 dict(id='main-parked-cargo',polygon=[[1129,614],[1151,618],[1170,624],
  [1189,627],[1198,633],[1198,637],[1230,646],[1246,654],[1255,669],
  [1261,674],[1261,686],[1235,693],[1216,681],[1193,675],[1172,666],
  [1154,653],[1145,641],[1137,637]]),
 dict(id='rear-port-shuttle',polygon=[[1107,603],[1115,601],[1133,606],
  [1144,614],[1143,622],[1132,624],[1111,614]]),
 dict(id='port-shuttle',polygon=[[1099,632],[1109,629],[1125,637],
  [1140,646],[1146,654],[1145,663],[1136,666],[1119,657],[1104,644]]),
 dict(id='rear-center-shuttle',polygon=[[1193,605],[1202,603],[1215,609],
  [1223,617],[1235,618],[1244,624],[1244,634],[1233,636],[1213,627],[1194,618]]),
 dict(id='right-workbench',polygon=[[1310,628],[1317,628],[1323,631],
  [1344,630],[1354,636],[1352,649],[1333,654],[1312,647],[1308,640]]),
 dict(id='front-right-cargo',polygon=[[1305,659],[1321,655],[1338,661],
  [1357,663],[1361,677],[1340,685],[1323,684],[1304,673]]),
 dict(id='front-service-crate',polygon=[[1200,683],[1207,680],[1216,682],
  [1219,688],[1217,697],[1204,701],[1200,694]]),
 dict(id='front-service-dolly',polygon=[[1188,697],[1195,693],[1204,695],
  [1206,702],[1202,711],[1188,713]]),
 dict(id='front-port-crates',polygon=[[1085,707],[1096,702],[1112,704],
  [1117,709],[1134,710],[1137,721],[1118,728],[1095,723]]),
 dict(id='front-starboard-crates',polygon=[[1260,680],[1271,678],[1282,684],
  [1291,682],[1296,688],[1291,695],[1274,696],[1258,690]])
]
workers=[
 dict(id='rear-inspection',path=[[1129,597],[1147,601],[1161,607]],height=6.8,speed=1.4,dwell=[2.5,7],color=[191,163,107]),
 dict(id='starboard-technician',path=[[1252,623],[1265,629],[1282,636]],height=7.3,speed=1.5,dwell=[3,8],color=[141,172,184]),
 dict(id='port-deck-worker',path=[[1103,674],[1115,684],[1133,694]],height=9.2,speed=1.7,dwell=[2,6],color=[185,144,88]),
 dict(id='cargo-inspector',path=[[1272,651],[1281,659],[1291,668]],height=8.5,speed=1.4,dwell=[3.5,9],color=[175,181,160]),
]
robots=[]
welders=[
 dict(id='cargo-welder',x=1158,y=669,height=8,tool=[1164,661],color=[164,146,102]),
 dict(id='bench-welder',x=1302,y=642,height=7.4,tool=[1310,635],color=[151,164,175]),
]
work_lights=[
 dict(x=1132,y=587,radius=21,color=[255,211,155],period=11.3,phase=.8,
  floorPolygon=[[1100,598],[1140,592],[1172,604],[1147,620],[1107,616]]),
 dict(x=1198,y=586,radius=19,color=[248,216,175],period=17.7,phase=3.1,
  floorPolygon=[[1169,591],[1200,585],[1229,598],[1215,609],[1185,616]]),
 dict(x=1278,y=601,radius=22,color=[255,205,142],period=13.2,phase=6.8,
  floorPolygon=[[1244,601],[1280,605],[1307,620],[1284,641],[1250,632]]),
 dict(x=1333,y=630,radius=20,color=[233,223,196],period=19.5,phase=10.2,
  floorPolygon=[[1303,626],[1337,632],[1360,651],[1325,670],[1297,648]]),
 dict(x=1103,y=658,radius=23,color=[255,208,146],period=15.9,phase=4.4,
  floorPolygon=[[1081,641],[1103,652],[1130,674],[1135,697],[1105,710],[1082,687]]),
]
hangar=dict(aperture=dock['aperture'],floors=[floor],occluders=occluders,
 workers=workers,robots=robots,welders=welders,workLights=work_lights)
sequence=[
 dict(points=[[1112,729],[1154,723],[1196,714],[1239,704],[1283,693],[1327,680],[1368,666]],color=[120,214,235],period=3.6,phase=.2,dockId='main'),
 dict(points=[[1351,659],[1337,647],[1324,635],[1310,623]],color=[255,190,104],period=4.2,phase=1.7,dockId='main'),
]
data=dict(IMAGE_WIDTH=width,IMAGE_HEIGHT=height,COORDINATES='source-pixels',
 STATION_LIGHTS=lights,HULL_MASK=hull,DOCKS=[dock],BEACONS=beacons,
 SEQUENCE_LIGHTS=sequence,SHIP_ROUTES=routes,HANGAR=hangar)
js='// Generated by build-station-data.py. All geometry is in source pixels.\n'+'\n'.join(
 f'export const {key} = {json.dumps(value,separators=(",", ":"))};' for key,value in data.items())+'\n'
(root/'station-data.json').write_text(json.dumps(data,indent=2)+'\n')
(root/'station-data.js').write_text(js)
(root/'station-data-browser.js').write_text('window.STATION = '+json.dumps(data,separators=(',',':'))+';\n')
(root/'extension/nightfall@local/station-data.js').write_text(js)

diagnostic=image.copy();p=ImageDraw.Draw(diagnostic)
for piece in hull:
    p.line([tuple(v) for v in piece['polygon']]+[tuple(piece['polygon'][0])],fill=(54,193,247),width=2)
    for hole in piece['holes']:p.line([tuple(v) for v in hole]+[tuple(hole[0])],fill=(235,102,208),width=2)
for light in lights:
    x,y=light['x'],light['y'];p.rectangle((x-1,y-1,x+1,y+1),outline=(255,207,89))
for beacon in beacons:
    x,y=beacon['x'],beacon['y'];p.ellipse((x-4,y-4,x+4,y+4),outline=(255,87,84),width=1)
p.line([tuple(v) for v in dock['aperture']]+[tuple(dock['aperture'][0])],fill=(115,255,147),width=2)
p.line([tuple(v) for v in dock['frontLip']]+[tuple(dock['frontLip'][0])],fill=(255,186,66),width=2)
for route in routes:
    color=(111,244,163) if route['mode']=='arrival' else (251,177,75) if route['mode']=='departure' else (167,157,255)
    p.line([tuple(v) for v in route['points']],fill=color,width=2)
    for x,y in route['points']:p.ellipse((x-3,y-3,x+3,y+3),fill=color)
p.rectangle((12,12,845,45),fill=(8,16,28))
p.text((22,22),f'STATION: {len(lights)} source windows | {len(beacons)} beacons | cyan hull / magenta ring opening / green dock aperture',fill=(231,239,246))
diagnostic.save(root/'station-data-diagnostic.png')
# Enlarged contact-point map is separate from the original photograph.
hangar_diagnostic=image.copy();p=ImageDraw.Draw(hangar_diagnostic)
p.line([tuple(v) for v in dock['aperture']]+[tuple(dock['aperture'][0])],fill=(115,255,147),width=1)
for poly in hangar['floors']:
    p.line([tuple(v) for v in poly]+[tuple(poly[0])],fill=(90,177,255),width=1)
for piece in occluders:
    poly=piece['polygon'];p.line([tuple(v) for v in poly]+[tuple(poly[0])],fill=(244,112,146),width=1)
for i,worker in enumerate(workers):
    p.line([tuple(v) for v in worker['path']],fill=(100,255,155),width=1)
    x,y=worker['path'][0];p.line((x,y,x,y-worker['height']),fill=(100,255,155),width=1)
    p.text((x+2,y-worker['height']-5),f'W{i+1}',fill=(100,255,155))
    for x,y in worker['path']:p.ellipse((x-1,y-1,x+1,y+1),fill=(100,255,155))
for i,robot in enumerate(robots):
    p.line([tuple(v) for v in robot['path']],fill=(107,223,255),width=1)
    x,y=robot['path'][0];p.text((x+2,y-9),f'R{i+1}',fill=(107,223,255))
    for x,y in robot['path']:p.ellipse((x-1,y-1,x+1,y+1),fill=(107,223,255))
for i,welder in enumerate(welders):
    x,y=welder['x'],welder['y'];tx,ty=welder['tool']
    p.line((x,y,x,y-welder['height']),fill=(255,245,145),width=1)
    p.line((x,y-4,tx,ty),fill=(255,245,145),width=1)
    p.ellipse((tx-2,ty-2,tx+2,ty+2),outline=(255,245,145));p.text((x-5,y+3),f'F{i+1}',fill=(255,245,145))
for i,lamp in enumerate(work_lights):
    x,y=lamp['x'],lamp['y'];p.ellipse((x-3,y-3,x+3,y+3),outline=(255,194,82))
    p.text((x+4,y-5),f'L{i+1}',fill=(255,194,82))
hangar_diagnostic.save(root/'station-hangar-diagnostic.png')
hangar_diagnostic.crop((1050,540,1405,747)).resize((1420,828),Image.Resampling.NEAREST).save(root/'station-hangar-diagnostic-crop.png')
print(json.dumps(dict(windows=len(lights),facades=facade_counts,beacons=len(beacons),routes=len(routes),workers=len(workers),robots=len(robots),welders=len(welders),workLights=len(work_lights))))
