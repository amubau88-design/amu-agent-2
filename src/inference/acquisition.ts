import type {CodingProfile} from './profiles.ts';
/** Resource assessment only. Does not authorize/download/load weights or relax runner reserve. */
export function codingAcquisitionPlan(profile:CodingProfile,freeDiskBytes:number,ramBudgetBytes:number){
 const reserve=20*1024**3,weightBytes=profile.minimumWeightBytes,reasons:string[]=[];
 const valid=(n:number)=>Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
 if(!valid(freeDiskBytes)||!valid(ramBudgetBytes)||!valid(weightBytes)||weightBytes===0)reasons.push('Unknown or invalid resource/weight size; manual review required');
 if(profile.planningOnly)reasons.push('Future candidate only: GGUF conversion, runtime and template require separate review');
 const kv=profile.expectedLayers&&profile.headDimension&&profile.expectedKvHeads?profile.defaultContext*profile.expectedLayers*profile.headDimension*profile.expectedKvHeads*4:0;
 const estimatedRamBytes=Math.ceil(weightBytes*1.2+kv+512*1024**2),remainingDiskBytes=freeDiskBytes-weightBytes;
 if(remainingDiskBytes<reserve)reasons.push('Model acquisition would consume the 20 GiB runner starter reserve');
 if(estimatedRamBytes>ramBudgetBytes)reasons.push('Estimated model/context RAM exceeds the current budget after system reserve');
 return {resourceFit:reasons.length===0,reasons,weightBytes,remainingDiskBytes,requiredRunnerReserveBytes:reserve,minimumFreeBeforeBytes:weightBytes+reserve,estimatedRamBytes,availableRamBudgetBytes:ramBudgetBytes,estimateOnly:true,downloadAuthorized:false,loadAuthorized:false,willDownload:false,willLoad:false};
}
