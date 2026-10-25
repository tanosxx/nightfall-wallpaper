/* Translate coherent photographic clouds without shearing their shapes.
 * The lower-left clouds and foreground remain the untouched source photograph. */
(() => {
  'use strict';
  const W=1672,H=941,clamp=x=>Math.max(0,Math.min(1,x));
  const sea=[[85,468],[300,443],[585,337],[840,333],[1127,336],[1445,332],[1582,470],[1672,632],[1672,941],[0,941],[0,620]];
  const buildings=[
    // Follow the visible tower below the turbine all the way into the mist.
    // The previous contour stopped at y688, leaving its lower facade mobile.
    [[0,0],[490,0],[490,303],[552,311],[575,343],[589,494],[627,503],[630,773],[621,779],[610,771],[592,774],[577,765],[564,768],[548,762],[538,749],[529,741],[522,718],[510,709],[498,695],[481,692],[473,685],[461,680],[435,673],[433,614],[320,586],[277,539],[153,499],[85,471],[0,470]],
    [[0,450],[88,450],[96,502],[146,514],[146,648],[115,654],[115,705],[0,705]],
    [[638,435],[644,417],[665,410],[667,263],[675,252],[682,418],[690,416],[695,225],[702,222],[703,187],[716,184],[718,150],[729,150],[735,184],[742,185],[749,219],[760,223],[759,345],[782,350],[792,372],[807,380],[815,467],[826,480],[828,591],[770,607],[729,559],[695,527],[676,492],[644,497]],
    [[886,405],[896,367],[897,340],[903,336],[905,318],[911,319],[916,347],[922,344],[924,326],[931,335],[936,372],[947,381],[947,422]],
    [[1031,371],[1034,346],[1039,342],[1040,321],[1045,343],[1050,351],[1053,373]],
    [[1094,365],[1097,337],[1103,327],[1109,335],[1114,366]],
    // Each eastern tower has its own silhouette. The gaps between towers are
    // clouds, while the narrow rear tower and its bridge remain architecture.
    [[1179,570],[1179,531],[1182,528],[1182,480],[1191,479],[1192,460],[1199,458],[1199,449],[1202,449],[1203,461],[1212,461],[1213,451],[1221,451],[1221,467],[1228,468],[1228,481],[1232,483],[1232,537],[1235,539],[1236,560],[1228,566],[1219,571],[1207,575],[1192,574]],
    [[1230,492],[1230,411],[1235,410],[1237,351],[1244,350],[1245,344],[1251,344],[1252,349],[1258,349],[1259,358],[1265,358],[1265,347],[1272,347],[1274,358],[1279,358],[1279,467],[1284,469],[1284,482],[1291,483],[1291,546],[1287,553],[1276,561],[1261,569],[1247,565],[1243,553],[1244,528],[1245,485],[1239,487]],
    [[1284,499],[1284,406],[1289,405],[1289,382],[1293,379],[1300,379],[1300,355],[1305,351],[1310,351],[1311,356],[1320,356],[1323,359],[1325,398],[1328,400],[1328,444],[1332,444],[1332,482],[1336,487],[1333,496],[1324,501],[1309,508],[1296,507]],
    [[1330,495],[1330,449],[1334,445],[1340,445],[1340,439],[1347,439],[1349,295],[1357,294],[1357,288],[1363,288],[1365,275],[1370,274],[1371,265],[1377,265],[1380,285],[1387,287],[1389,315],[1393,318],[1393,337],[1403,338],[1405,344],[1405,439],[1408,442],[1408,462],[1403,475],[1394,481],[1378,486],[1358,494],[1343,501]],
    [[1330,731],[1331,638],[1334,636],[1335,631],[1340,630],[1342,634],[1347,632],[1348,617],[1350,615],[1352,612],[1353,610],[1356,611],[1358,613],[1360,617],[1360,630],[1365,628],[1367,630],[1367,634],[1373,634],[1375,632],[1378,634],[1379,638],[1379,683],[1377,701],[1374,719],[1366,733],[1352,737],[1340,735]],
    // Follow the near tower rather than keeping a rectangular piece of sky.
    // The irregular lower contour lies inside its original atmospheric fade;
    // every segment participates in the broad mist blend below.
    [[1542,0],[1672,0],[1672,672],[1654,675],[1636,672],[1620,679],[1607,681],[1590,688],[1579,694],[1560,700],[1539,707],[1515,717],[1488,726],[1467,732],[1434,739],[1413,737],[1413,509],[1416,505],[1416,500],[1440,498],[1440,491],[1445,491],[1445,468],[1450,466],[1450,453],[1446,453],[1446,355],[1442,353],[1442,190],[1433,187],[1433,176],[1457,172],[1457,152],[1465,150],[1465,145],[1471,145],[1472,115],[1477,111],[1487,111],[1493,115],[1493,146],[1507,150],[1509,170],[1537,170],[1537,32],[1542,30]],
    // Exposed bridge deck and diagonal supports between the two rear towers.
    [[1323,402],[1353,402],[1353,410],[1348,410],[1347,415],[1344,415],[1343,411],[1331,411],[1328,415],[1325,415],[1327,410],[1323,410]],
    [[1343,410],[1354,422],[1353,427],[1340,412]],
    // Thin antennae and service masts are protected separately, without
    // freezing the cloud-filled spaces beside the tower bodies.
    [[1216,432],[1219,432],[1219,452],[1216,452]],
    [[1227,448],[1230,448],[1230,483],[1227,483]],
    [[1265,323],[1268,323],[1268,347],[1265,347]],
    [[1276,348],[1279,348],[1279,359],[1276,359]],
    [[1284,431],[1287,431],[1287,484],[1284,484]],
    [[1314,321],[1318,321],[1318,357],[1314,357]],
    [[1297,369],[1300,369],[1300,382],[1297,382]],
    [[1372,232],[1375,232],[1375,267],[1372,267]],
    [[1401,322],[1404,322],[1404,342],[1401,342]],
    [[1353.5,597],[1354.5,597],[1355,606],[1355.5,610],[1352.5,611],[1352,607],[1353.5,606]],
    [[1441,450],[1444,450],[1444,502],[1441,502]],
    [[1480,28],[1484,28],[1484,113],[1480,113]],
    [[1509,141],[1513,141],[1513,174],[1509,174]],
  ];
  const mistBases=[
    {index:0,minY:635,feather:30},{index:2,minY:486,feather:28},
    {index:3,minY:375,feather:12},{index:4,minY:350,feather:10},
    {index:5,minY:349,feather:10},
    {index:6,minY:530,feather:45},{index:7,minY:525,feather:48},
    {index:8,minY:480,feather:40},{index:9,minY:440,feather:48},
    {index:10,minY:690,feather:45},{index:11,minY:630,feather:70},
  ];
  // Foreground rails and pipes remain rigid while clouds pass behind them.
  const rails=[
    [[111,650],[1510,757],10],
    [[111,683],[1421,800],5],
    [[304,760],[1435,899],12],
    [[263,659],[263,724],10],
    [[443,674],[443,770],12],
    [[831,702],[830,815],14],
    [[1281,738],[1279,870],17],
  ];
  // Trace the floor and pipe silhouette, then the small fixtures and post
  // brackets. Keeping these separate leaves each opening between bars clear.
  const foregroundShapes=[
    [[0,747],[98,734],[180,710],[207,708],[222,718],[270,716],[291,727],[303,747],[306,767],[500,793],[830,834],[1279,889],[1416,907],[1405,795],[1436,785],[1466,790],[1468,762],[1489,732],[1520,716],[1558,711],[1581,718],[1594,709],[1606,714],[1617,724],[1672,724],[1672,941],[0,941]],
    [[161,652],[190,654],[190,666],[162,665]],
    [[574,679],[608,682],[608,696],[574,693]],
    [[1365,741],[1408,745],[1408,762],[1365,758]],
    [[251,654],[270,653],[275,662],[271,672],[253,671]],
    [[252,689],[271,689],[274,699],[251,699]],
    [[432,666],[452,666],[458,675],[454,684],[431,682]],
    [[432,704],[451,704],[454,715],[430,715]],
    [[421,756],[430,752],[436,759],[454,759],[460,755],[466,760],[465,779],[420,774]],
    [[818,695],[839,692],[848,700],[845,713],[818,712]],
    [[818,730],[840,730],[843,742],[817,742]],
    [[804,798],[814,797],[818,804],[840,804],[844,799],[855,804],[855,821],[803,817]],
    [[1266,729],[1288,726],[1295,732],[1293,748],[1265,746]],
    [[1267,775],[1293,778],[1293,792],[1267,789]],
    [[1248,855],[1262,852],[1267,859],[1298,860],[1305,857],[1311,862],[1311,882],[1246,874]],
  ];
  const stormEvents=[{at:6.4,duration:.86,x:1209,y:241,power:.57},{at:25.8,duration:1.1,x:1053,y:239,power:.43},{at:54.1,duration:.73,x:1273,y:249,power:.65},{at:81.7,duration:.92,x:1138,y:212,power:.48}];
  function stormAt(time){
    const t=((Math.max(0,time)%113)+113)%113;
    let best={power:0,x:1209,y:241};
    for(const e of stormEvents){const age=t-e.at;if(age<0||age>e.duration)continue;
      const pulse=(c,w,a)=>a*Math.exp(-Math.pow((age-c)/w,2));
      const power=e.power*(pulse(.08,.055,1)+pulse(.29,.09,.61)+pulse(.48,.16,.26));
      if(power>best.power)best={power,x:e.x,y:e.y};
    }return best;
  }
  const motion={speed:.85,farSpeed:.85,nearSpeed:.85,textureWidth:W*2};
  const assetRoot=typeof document!=='undefined'?new URL('.',document.currentScript.src):null;
  const smooth=(a,b,x)=>{const f=clamp((x-a)/(b-a));return f*f*(3-2*f);};
  function cloudCoverageAt(x,y){return 1-(1-smooth(650,850,x))*smooth(420,470,y);}
  function flowAt(x,y,time){return {x:x+time*motion.speed,y,speed:motion.speed};}
  window.CLOUDCITY_ATMOSPHERE={W,H,sea,buildings,mistBases,rails,foregroundShapes,stormAt,flowAt,stormEvents,motion,cloudCoverageAt};
  window.createCloudcityAtmosphere=photo=>{
    const canvas=Object.assign(document.createElement('canvas'),{width:W,height:H});
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('Для движения облаков нужен WebGL.');
    const mask=Object.assign(document.createElement('canvas'),{width:W,height:H}),c=mask.getContext('2d',{willReadFrequently:true});
    function polygon(points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
    c.fillStyle='#000';c.fillRect(0,0,W,H);c.fillStyle='#fff';polygon(sea);
    c.fillStyle='#000';buildings.forEach(polygon);
    foregroundShapes.forEach(polygon);
    c.strokeStyle='#000';c.lineCap='round';for(const [a,b,w] of rails){c.lineWidth=w+2;c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();}
    const pixels=c.getImageData(0,0,W,H),distance=new Float32Array(W*H);
    for(let i=0;i<distance.length;i++)distance[i]=pixels.data[i*4]>128?9999:0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(distance[i])distance[i]=Math.min(distance[i],x?distance[i-1]+1:0,y?distance[i-W]+1:0,x&&y?distance[i-W-1]+1.414:9999);}
    for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){const i=y*W+x;if(distance[i])distance[i]=Math.min(distance[i],x<W-1?distance[i+1]+1:0,y<H-1?distance[i+W]+1:0,x<W-1&&y<H-1?distance[i+W+1]+1.414:9999);}
    const bases=mistBases.map(({index,minY,feather})=>{const polygon=buildings[index];return {polygon,minY,feather,minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),maxY:Math.max(...polygon.map(p=>p[1]))};});
    function baseOpacity(x,y){
      let opacity=1;
      for(const {polygon,minY,feather,minX,maxX,maxY} of bases){
        if(y<minY-feather||y>maxY+feather||x<minX-feather||x>maxX+feather)continue;
        let distance=1e9;
        for(let j=0;j<polygon.length;j++){
          const a=polygon[j],b=polygon[(j+1)%polygon.length];
          if(Math.min(a[1],b[1])<minY)continue;
          if(x<Math.min(a[0],b[0])-feather||x>Math.max(a[0],b[0])+feather||y<Math.min(a[1],b[1])-feather||y>Math.max(a[1],b[1])+feather)continue;
          const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));
          distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
        }
        const f=clamp(distance/feather);opacity=Math.min(opacity,f*f*(3-2*f));
      }
      return opacity;
    }
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4,f=clamp(distance[y*W+x]/2),sky=clamp((1-Math.pow((x-1120)/340,2)-Math.pow((y-212)/112,2))*2);
      pixels.data[i]=Math.round(f*f*(3-2*f)*(f?baseOpacity(x,y):0)*cloudCoverageAt(x,y)*255);pixels.data[i+1]=Math.round(sky*255);
      pixels.data[i+2]=0;pixels.data[i+3]=255;
    }c.putImageData(pixels,0,0);
    const vertex='attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0,1);}';
    const fragment=`precision highp float;
      varying vec2 uv; uniform sampler2D photo,mask,clouds;
      uniform float windTime; uniform vec3 storm; uniform float cloudSpeed;
      void main(){
        vec2 p=uv*vec2(1672.,941.);vec2 field=texture2D(mask,uv).rg;
        vec3 original=texture2D(photo,uv).rgb;
        // One velocity preserves the photographed cumulus silhouettes even
        // after hours. A y-dependent velocity accumulates into diagonal streaks.
        vec2 cloudUV=vec2(fract((p.x-windTime*cloudSpeed)/3344.),uv.y);
        vec3 cloud=texture2D(clouds,cloudUV).rgb;
        float coverage=field.r*smoothstep(331.,390.,p.y);
        vec3 col=mix(original,cloud,coverage);
        vec2 stormDelta=(p-storm.xy)/vec2(165.,80.);
        float illumination=exp(-dot(stormDelta,stormDelta)*1.5)*field.g*storm.z;
        col+=vec3(.53,.60,.83)*illumination*(.35+dot(original,vec3(.3,.5,.2)));
        gl_FragColor=vec4(col,1.);
      }`;
    function shader(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    function texture(source,i,name){gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,name),i);}
    texture(photo,0,'photo');texture(mask,1,'mask');
    const uWind=gl.getUniformLocation(program,'windTime'),uStorm=gl.getUniformLocation(program,'storm');
    gl.uniform1f(gl.getUniformLocation(program,'cloudSpeed'),motion.speed);gl.viewport(0,0,W,H);
    let loaded=false;
    const ready=(async()=>{
      const clean=new Image();clean.src=new URL('assets/cloudcity-cloud-plate.png',assetRoot).href;await clean.decode();
      const make=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
      const restored=make(),r=restored.getContext('2d',{willReadFrequently:true});r.drawImage(clean,0,0,W,H);
      const fill=r.getImageData(0,0,W,H);
      const source=make(),o=source.getContext('2d',{willReadFrequently:true});o.drawImage(photo,0,0,W,H);const original=o.getImageData(0,0,W,H);
      // Match the reconstructed material to the original photograph's local
      // exposure. Only hidden regions need it; open source clouds are retained.
      const rowGains=Array.from({length:H},()=>[1,1,1]),rowColors=Array.from({length:H},()=>[105,124,151]);
      for(let y=330;y<H;y++){
        const sumA=[0,0,0],sumB=[0,0,0];let count=0;
        for(let x=0;x<W;x+=3)if(distance[y*W+x]>40){const i=(y*W+x)*4;for(let k=0;k<3;k++){sumA[k]+=original.data[i+k];sumB[k]+=fill.data[i+k];}count++;}
        if(count>20){rowGains[y]=sumA.map((v,k)=>Math.max(.55,Math.min(1.35,v/Math.max(1,sumB[k]))));rowColors[y]=sumA.map(v=>v/count);}
        else if(y>330){rowGains[y]=rowGains[y-1].slice();rowColors[y]=rowColors[y-1].slice();}
      }
      for(let y=0;y<H;y++){
        const gain=[0,0,0],color=[0,0,0];let rows=0;
        for(let yy=Math.max(0,y-24);yy<=Math.min(H-1,y+24);yy++){for(let k=0;k<3;k++){gain[k]+=rowGains[yy][k];color[k]+=rowColors[yy][k];}rows++;}
        for(let x=0;x<W;x++){
          const i=(y*W+x)*4,f=clamp((distance[y*W+x]-10)/38),weight=f*f*(3-2*f);
          const rgb=[0,1,2].map(k=>fill.data[i+k]*gain[k]/rows);
          const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
          const reference=(color[0]*.2126+color[1]*.7152+color[2]*.0722)/rows;
          const matchedLuminance=reference+(luminance-reference)*.78;
          for(let k=0;k<3;k++){
            const matched=matchedLuminance*(color[k]/rows)/Math.max(1,reference);
            const corrected=rgb[k]*.22+matched*.78;
            fill.data[i+k]=Math.round(original.data[i+k]*weight+corrected*(1-weight));
          }
          fill.data[i+3]=255;
        }
      }
      r.putImageData(fill,0,0);
      // A reflected extension joins the same edge pixels at both seams.
      // This is a static spatial texture; its motion never reverses.
      const strip=Object.assign(document.createElement('canvas'),{width:W*2,height:H}),t=strip.getContext('2d');
      t.drawImage(restored,0,0);t.save();t.translate(W*2,0);t.scale(-1,1);t.drawImage(restored,0,0);t.restore();
      texture(strip,2,'clouds');loaded=true;
    })();
    return {ready,render(ctx,time,windTime=time){if(!loaded){ctx.drawImage(photo,0,0);return;}const s=stormAt(time);gl.uniform1f(uWind,windTime);gl.uniform3f(uStorm,s.x,s.y,s.power);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(canvas,0,0);},getDiagnostics:()=>({renderer:'coherent-photographic-clouds',cloudDirection:'right',cloudLayers:1,photographicClouds:true,temporalCrossfade:false,proceduralMist:false,accumulatingShear:false,lowerLeft:'original-photograph',textureWidth:motion.textureWidth,speed:motion,protectedBuildings:buildings.length,stormEvents:stormEvents.length})};
  };
})();
