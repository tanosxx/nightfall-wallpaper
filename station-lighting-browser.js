/* Classic browser wrapper of station-lighting.js. */
(function () {
/* Shared 2.5D light controls. Normals come from the photographed station,
 * not a full 3D model. Direction is camera space: +X right, +Y up, +Z forward. */
const TAU = Math.PI * 2;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = t => t*t*(3-2*t);
const direction = angle => [Math.cos(angle)*Math.sqrt(1-.58*.58),Math.sin(angle)*Math.sqrt(1-.58*.58),.58];
const MODES = {
    shift: {direction:direction(2.4),ambient:.92,key:.24,gloss:.24,coolness:.12,sectorWeights:[1,.95,.90],weldGain:.85,windowFactor:1,scanGain:0},
    night: {direction:direction(.25),ambient:.43,key:.15,gloss:.40,coolness:.94,sectorWeights:[.55,.68,.76],weldGain:.65,windowFactor:1.08,scanGain:0},
    service: {direction:direction(2.85),ambient:.68,key:.29,gloss:.52,coolness:.52,sectorWeights:[.92,1.05,1.10],weldGain:1.65,windowFactor:1,scanGain:.48},
};
const clone = p => ({...p,direction:[...p.direction],sectorWeights:[...p.sectorWeights]});
const STATION_MODES = Object.freeze(['shift','night','service']);
function createStationLighting(mode = 'shift') {
    mode = STATION_MODES.includes(mode) ? mode : 'shift';
    const controller = {time:0,mode,targetMode:mode,state:{}};
    let current=clone(MODES[mode]),from=clone(current),target=clone(current),elapsed=4;
    function expose() {
        const state=controller.state;
        Object.assign(state,current);
        state.direction=[...current.direction];state.sectorWeights=[...current.sectorWeights];
        const length=Math.hypot(...state.direction)||1;state.direction=state.direction.map(v=>v/length);
        state.darkness=1-current.ambient;
        state.keyColor=[mix(214,171,current.coolness),mix(207,207,current.coolness),mix(184,237,current.coolness)];
        state.scanPosition=(controller.time*.055)%1.4-.2;
        state.scanWidth=.085;
        state.transition=clamp(elapsed/4,0,1);
    }
    controller.setMode=(id,immediate=false)=>{
        if(!STATION_MODES.includes(id))return false;
        if(id===controller.targetMode&&!immediate)return true;
        controller.targetMode=id;from=clone(current);target=clone(MODES[id]);elapsed=immediate?4:0;
        if(immediate){current=clone(target);controller.mode=id;}
        expose();return true;
    };
    controller.update=dt=>{
        dt=clamp(Number.isFinite(dt)?dt:0,0,.1);controller.time+=dt;
        if(elapsed<4){elapsed=Math.min(4,elapsed+dt);const t=smooth(elapsed/4);current={};
            for(const key of Object.keys(target))current[key]=Array.isArray(target[key])?target[key].map((v,i)=>mix(from[key][i],v,t)):mix(from[key],target[key],t);
            if(elapsed>=4)controller.mode=controller.targetMode;
        }
        expose();return controller.state;
    };
    expose();return controller;
}

window.STATION_LIGHTING = Object.freeze({createStationLighting,STATION_MODES});
})();
