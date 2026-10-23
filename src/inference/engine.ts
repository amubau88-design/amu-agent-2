export {AMUInferenceEngine} from './slot.ts';
export type {Message,Generation,GenerationResult} from './slot.ts';
import {AMUWorkerPool} from './pool.ts';
export const amuInference=new AMUWorkerPool();
