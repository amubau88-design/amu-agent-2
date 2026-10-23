import type {Generation,GenerationResult} from './engine.ts';
export type GenerationLease={settle:(result?:GenerationResult)=>void};
let authorize:((input:Generation)=>GenerationLease)|undefined;
export function setGenerationPolicy(policy:typeof authorize){authorize=policy;}
export function generationLease(input:Generation){return authorize?.(input);}
