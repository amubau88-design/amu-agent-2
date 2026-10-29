import {EngineError} from '../inference/models.ts';
/** Metadata-only admission is not an execution or an isolation acceptance. */
export function assertRunnerAdmission(response:any,expected:{serverId:string;challenge:string;runId:string;snapshotDigest:string;profileDigest:string}){
 if(response?.protocolVersion!==1||Object.entries(expected).some(([key,value])=>response[key]!==value)||response.executed!==false||typeof response.accepted!=='boolean')throw new EngineError(502,'Runner profile preflight identity mismatch; no source transferred');
 if(!response.accepted)throw new EngineError(409,'Exact test profile is not provisioned on this runner; no source transferred');
}
