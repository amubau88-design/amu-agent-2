import type {AMUInferenceEngine,Generation,GenerationResult} from './slot.ts';
export type WorkerStatus=Omit<ReturnType<AMUInferenceEngine['status']>,'runtimeProfile'>&{runtimeProfile?:object|null};
/** Transport boundary. Current implementation uses private local IPC, without a network listener. */
export interface InferenceWorker {
 status():WorkerStatus;
 start():Promise<void>;
 pause():Promise<void>;
 selectModel(model:string):Promise<void>;
 generate(input:Generation):Promise<GenerationResult>;
 enforceMemoryPressure(freeBytes?:number):Promise<boolean>;
 close():Promise<void>;
}
