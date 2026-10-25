(() => {
  'use strict';
  window.createCloudcityScene=photo=>{
    const atmosphere=window.createCloudcityAtmosphere(photo);
    const lights=window.createCloudcityLights(photo);
    const turbines=window.createCloudcityTurbines(photo);
    return {
      ready:atmosphere.ready,
      render(ctx,time,strength=.65,windTime=time){
        atmosphere.render(ctx,time,windTime);
        lights.render(ctx,time,1);
        turbines.render(ctx,windTime,1);
      },
      getDiagnostics:()=>({atmosphere:atmosphere.getDiagnostics(),lights:lights.getDiagnostics(),turbines:turbines.getDiagnostics()})
    };
  };
})();
