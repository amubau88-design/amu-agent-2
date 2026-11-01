import type {InferenceWorker} from './contracts.ts';
import type {WorkerDefinition} from './pool.ts';
import {AMUInferenceEngine} from './slot.ts';
import {RemoteInferenceWorker} from './remote.ts';
import {EngineError} from './models.ts';

export type BackendFactory = (definition: WorkerDefinition) => InferenceWorker;
/** Trusted application composition only. API requests cannot load code, register providers or grant network access. */
export class InferenceBackends {
  private factories = new Map<string, BackendFactory>();
  register(id: string, factory: BackendFactory) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id) || typeof factory !== 'function' || this.factories.has(id))
      throw new EngineError(400, 'Invalid or duplicate inference backend');
    this.factories.set(id, factory);
    return this;
  }
  create(definition: WorkerDefinition): InferenceWorker {
    const id = definition.backend ?? (definition.remote ? 'amu-secure-worker' : 'llama-cpp');
    if ((id === 'amu-secure-worker') !== !!definition.remote)
      throw new EngineError(400, 'Backend and remote transport disagree');
    const factory = this.factories.get(id);
    if (!factory) throw new EngineError(400, 'Inference backend is not installed');
    const worker = factory({...definition});
    for (const method of ['status','start','pause','selectModel','generate','enforceMemoryPressure','close'])
      if (typeof (worker as any)?.[method] !== 'function') throw new EngineError(400, 'Incomplete inference backend contract');
    return worker;
  }
}
export function standardInferenceBackends() {
  return new InferenceBackends()
    .register('llama-cpp', definition => new AMUInferenceEngine({...definition, managed:true}))
    .register('amu-secure-worker', definition => new RemoteInferenceWorker(definition.remote!, definition.model, definition.maxMemoryMiB, definition.contextSize));
}
