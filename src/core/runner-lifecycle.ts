export const isolatedExecutions=new Map<string,{owner:string;snapshotId:string;controller:AbortController}>();
export const remoteExecutionBusy=()=>isolatedExecutions.size>0;
export const snapshotExecutionBusy=(id:string)=>[...isolatedExecutions.values()].some(run=>run.snapshotId===id);
