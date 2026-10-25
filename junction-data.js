/* Coordinates measured in the original 1672 × 941 painting. No camera motion. */
(() => {
  'use strict';
  const W=1672,H=941;
  const routes=[
    {id:'lower',points:[[0,510],[420,554.5],[850,624.5],[1250,689.5],[1672,772]],
      gauges:[10,14.5,18.5,23.5,27],scales:[.62,.74,.88,1.03,1.18],
      height:[32,61],halfGauge:[10,27],start:[0,510],end:[1672,772],
      occlusion:[]},
    {id:'upper',points:[[296,331],[600,345],[900,365],[1200,384],[1450,399]],
      gauges:[5.5,6.2,7.1,8.2,9],scales:[.43,.48,.53,.59,.64],
      height:[22,33],halfGauge:[5.5,9],start:[296,331],end:[1450,399],
      // The narrow gantry legs stand in front of this track. Restore these
      // source-image shapes after the train; never cut a rectangle around it.
      occlusion:[[[386,277],[391,277],[393,341],[387,340]],
        [[977,281],[982,280],[984,367],[979,367]],
        [[995,288],[1001,288],[1001,369],[995,369]],
        [[1105,321],[1112,321],[1114,378],[1107,378]],
        [[1303,336],[1311,336],[1313,404],[1305,403]],
        [[1316,345],[1321,345],[1322,405],[1317,405]],
        [[0,0],[299,0],[299,355],[0,355]],
        [[1450,0],[1672,0],[1672,431],[1450,431]]]},
  ];
  // y is the luminous signal head; base is the foot of its trackside post.
  const signals=[
    {id:'lower-entry',x:284,y:481,base:[284,512],scale:1.05},
    {id:'upper-entry',x:1396,y:369,base:[1396,398],scale:.68},
    {id:'yard-west',x:665,y:441,base:[665,462],scale:.56},
    {id:'yard-east',x:1264,y:554,base:[1264,584],scale:.7},
    {id:'high-siding',x:695,y:312,base:[695,330],scale:.46},
    {id:'platform',x:1365,y:501,base:[1365,530],scale:.65},
    {id:'distant',x:782,y:295,base:[782,309],scale:.32},
    {id:'maintenance',x:1020,y:550,base:[1020,575],scale:.64},
  ];
  const switches=[
    {id:'lower-points',x:922,y:492,scale:.67,
      blades:[[[910,481],[924,493],[933,512]],[[919,480],[930,491],[941,511]]],
      indicator:[905,486]},
    {id:'upper-points',x:798,y:322,scale:.43,
      blades:[[[788,313],[797,321],[804,334]],[[797,312],[804,321],[812,334]]],
      indicator:[817,322]},
  ];
  const vents=[
    {x:298,y:132,radius:14,rise:72,drift:31,life:14,alpha:.18},
    {x:350,y:154,radius:18,rise:85,drift:38,life:17,alpha:.13},
    {x:1166,y:162,radius:14,rise:76,drift:29,life:15,alpha:.17},
    {x:1505,y:539,radius:11,rise:49,drift:23,life:12,alpha:.14},
    {x:461,y:810,radius:8,rise:43,drift:16,life:11,alpha:.08},
  ];
  const neon=[
    {x:181,y:0,w:15,h:148,color:'cyan',phase:.1},
    {x:564,y:135,w:13,h:61,color:'cyan',phase:1.7},
    {x:617,y:185,w:13,h:155,color:'cyan',phase:4.1},
    {x:969,y:51,w:14,h:106,color:'cyan',phase:2.3},
    {x:1575,y:0,w:17,h:155,color:'cyan',phase:5.8},
    {x:1351,y:452,w:52,h:26,color:'cyan',phase:3.5},
    {x:1362,y:603,w:38,h:32,color:'cyan',phase:6.2},
  ];
  const facades=[
    {id:'lower-west',polygon:[[2,551],[415,613],[415,758],[2,680]],gain:.16},
    {id:'lower-center',polygon:[[420,615],[913,704],[913,932],[420,772]],gain:.14},
    {id:'lower-east',polygon:[[921,705],[1672,853],[1672,941],[1051,941],[921,871]],gain:.18},
    {id:'upper-front',polygon:[[302,350],[1448,410],[1448,443],[302,376]],gain:.13},
    {id:'left-wall',polygon:[[245,216],[295,226],[294,488],[247,483]],gain:.12},
    {id:'right-wall',polygon:[[1490,324],[1672,354],[1672,660],[1486,626]],gain:.1},
  ];
  function routeAt(id,u){
    const r=typeof id==='string'?routes.find(route=>route.id===id):id;
    if(!r)throw new Error(`Unknown junction route: ${id}`);
    u=Math.max(0,Math.min(1,Number.isFinite(u)?u:0));
    const p=r.points,x=p[0][0]+(p[p.length-1][0]-p[0][0])*u;
    let i=0;while(i<p.length-2&&x>p[i+1][0])i++;
    const a=p[i],b=p[i+1],dx=b[0]-a[0],v=(x-a[0])/dx;
    const slope=j=>{
      const lo=p[Math.max(0,j-1)],hi=p[Math.min(p.length-1,j+1)];
      return (hi[1]-lo[1])/(hi[0]-lo[0]);
    };
    const m0=slope(i)*dx,m1=slope(i+1)*dx,v2=v*v,v3=v2*v;
    const y=(2*v3-3*v2+1)*a[1]+(v3-2*v2+v)*m0+(-2*v3+3*v2)*b[1]+(v3-v2)*m1;
    const dy=((6*v2-6*v)*a[1]+(3*v2-4*v+1)*m0+(-6*v2+6*v)*b[1]+(3*v2-2*v)*m1)/dx;
    const scale=r.scales[i]+(r.scales[i+1]-r.scales[i])*v;
    return {x,y,scale,halfGauge:r.gauges[i]+(r.gauges[i+1]-r.gauges[i])*v,
      height:51.5*scale,tangent:Math.atan(dy),slope:dy,u};
  }
  window.JUNCTION_DATA={W,H,routes,signals,switches,vents,neon,facades,routeAt};
})();
