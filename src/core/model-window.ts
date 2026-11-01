/** Estimate scheduling room from observed calls, never increase an execution deadline. */
export function modelWindowDeferral(agent:any,windowMs:number,elapsedMs:number) {
  const durations=(agent.modelMetrics||[]).slice(-4).filter((m:any)=>m.status==='completed').map((m:any)=>m.wallMs).filter((n:any)=>Number.isFinite(n)&&n>0);
  if(Number.isFinite(agent.inheritedModelDurationMs)&&agent.inheritedModelDurationMs>0)durations.push(agent.inheritedModelDurationMs);
  if(!durations.length||!Number.isFinite(windowMs)||windowMs<=0||!Number.isFinite(elapsedMs)||elapsedMs<=0)return null;
  const observedMs=Math.max(...durations),requiredMs=Math.min(windowMs*0.9,Math.max(1000,Math.ceil(observedMs*1.1+2000))),remainingMs=Math.max(0,windowMs-elapsedMs);
  return remainingMs<requiredMs?{observedMs,requiredMs,remainingMs,noModelReserved:true,deadlinesExtended:false}:null;
}
