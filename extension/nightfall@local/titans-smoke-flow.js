// Source and destination masks contain smoke only. Every texture phase advects
// up-left; staggered reset crossfades are baked offline, never reverse direction.
export const FLOW_ASSET_FILES=Object.freeze({
 smokeFlowNear:'ground-flow-near.png',smokeFlowRight:'ground-flow-right.png',
 smokeFlowWreck:'ground-flow-wreck.png',smokeFlowHorizon:'ground-flow-horizon.png',
});
const FLOWS=[
 ['smokeFlowNear',816,609,214,124,0,1],
 ['smokeFlowRight',1568,373,104,166,1.7,.83],
 ['smokeFlowWreck',1364,438,104,93,3.1,.77],
 ['smokeFlowHorizon',851,241,116,131,4.2,.65],
];
export function drawSmokeFlow(ctx,assets,time,intensity){
 if(intensity<=0)return;
 ctx.save();ctx.globalCompositeOperation='source-over';
 for(const [key,x,y,w,h,offset,speed]of FLOWS){
  const p=((time*speed+offset)*8)%48, frame=Math.floor(p), mix=p-frame, next=(frame+1)%48;
  ctx.globalAlpha=intensity;
  ctx.drawImage(assets[key],frame%8*w,Math.floor(frame/8)*h,w,h,x,y,w,h);
  ctx.globalAlpha=mix*intensity;
  ctx.drawImage(assets[key],next%8*w,Math.floor(next/8)*h,w,h,x,y,w,h);
 }
 ctx.restore();
}
