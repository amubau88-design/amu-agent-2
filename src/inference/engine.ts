import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { EngineError, hardware, listLocalModels, modelPath } from './models.ts';
import { recordSystemEvent } from '../core/monitoring.ts';
import { assessModel, assertMemoryBudget } from './resources.ts';
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Generation = { model: string; messages: Message[]; maxTokens?: number; temperature?: number; signal?: AbortSignal; onChunk?: (text: string) => void; responseSchema?: object; clientId?: string; stream?: boolean };
export type GenerationResult = { content: string; usage: { prompt_tokens: number; completion_tokens: number }; finishReason: 'stop' | 'length'; ttftMs: number; durationMs: number };

type Job = { id: string; input: Generation; resolve: (r: GenerationResult) => void; reject: (e: Error) => void; cleanup: () => void; cancel: (reason?: Error) => void; cancelling?:boolean; cancellationTimer?:NodeJS.Timeout };
async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000); timer.unref();
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
export class AMUInferenceEngine {
  private worker?: ChildProcess;
  private initializing?: Promise<void>;
  private current?: Job;
  private queue: Job[] = [];
  private state = 'unloaded';
  private selected = listLocalModels()[0]?.id || '';
  private lastError: string | null = null;
  private restarts = 0;
  private completed = 0;
  private cancelled = 0;
  private nativeProcess: object | null = null;
  private closing = false;
  private paused = false;
  private switching = false;
  private loadTimeMs = 0;
  private lastGeneration: { durationMs: number; ttftMs: number; tokens: number } | null = null;
  private pressureCheck=setInterval(()=>{void this.enforceMemoryPressure().catch(()=>recordSystemEvent('memory_pressure_control_error'));},3000).unref();
  status() { return { backend: 'amu-embedded-llama.cpp', state: this.state, paused: this.paused, switching: this.switching, ready: this.state === 'ready', model: this.selected, active: this.current ? 1 : 0, queued: this.queue.length, restarts: this.restarts, cancelled:this.cancelled, completed: this.completed, loadTimeMs: this.loadTimeMs, lastGeneration: this.lastGeneration, requests: [...(this.current ? [{ id: this.current.id, clientId: this.current.input.clientId || 'internal', state: this.current.cancelling?'cancelling':'running', streaming: !!this.current.input.stream }] : []), ...this.queue.map(j => ({ id: j.id, clientId: j.input.clientId || 'internal', state: 'queued', streaming: !!j.input.stream }))], lastError: this.lastError, nativeProcess: this.nativeProcess, hardware }; }
  async initialize(duringSwitch = false): Promise<void> {
    if (this.closing) throw new EngineError(503, 'Engine is shutting down');
    if (this.switching && !duringSwitch) throw new EngineError(503, 'Model operation in progress');
    if (this.paused) throw new EngineError(503, 'Inference is paused by an operator');
    if (this.state === 'ready') return;
    if (this.initializing) return this.initializing;
    this.initializing = this.load().finally(() => { this.initializing = undefined; });
    return this.initializing;
  }
  private async load() {
    const model = listLocalModels().find(m => m.id === this.selected);
    if (!model) throw new EngineError(503, 'No AMU model installed; import a GGUF model first');
    const assessment = await assessModel(model.id); assertMemoryBudget(assessment.estimatedRamBytes, assessment.availableBudgetBytes);
    if (this.worker) await stopProcess(this.worker);
    this.state = 'loading';
    const loadStarted = Date.now();
    const entry = new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url);
    const worker = fork(fileURLToPath(entry), [], { execArgv: ['--experimental-strip-types'], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, AMU_INFERENCE_CONFIG: JSON.stringify({ modelPath: modelPath(model.id), sha256: model.sha256, ...hardware }) } });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new EngineError(504, 'Embedded model load deadline exceeded')); void stopProcess(worker); }, 90000);
      worker.on('message', (message: any) => {
        if (this.worker !== worker) return;
        if (message.nativeProcess) this.nativeProcess = message.nativeProcess;
        if (message.type === 'ready') { clearTimeout(timer); this.state = 'ready'; this.lastError = null; this.loadTimeMs = Date.now() - loadStarted; resolve(); }
        else if (this.current && message.id === this.current.id) {
          if (message.type === 'chunk') {
            if(this.current.cancelling)return;
            try { this.current?.input.onChunk?.(message.text); }
            catch { const job = this.current; this.current = undefined; job?.cleanup(); job?.reject(new EngineError(503, 'Streaming output failed')); const w = this.worker; this.worker = undefined; this.state = 'unloaded'; if (w) void stopProcess(w).finally(() => this.pump()); }
          }
          else {
            const job = this.current!; this.current = undefined; job.cleanup();clearTimeout(job.cancellationTimer);
            if(job.cancelling){void this.pump();return;}
            if (message.type === 'result') { this.completed++; this.lastGeneration = { durationMs: message.durationMs, ttftMs: message.ttftMs, tokens: message.usage.completion_tokens }; job.resolve(message); }
            else job.reject(new EngineError(message.status, message.message));
            void this.pump();
          }
        }
      });
      const fail = (message: string) => {
        clearTimeout(timer);
        reject(new EngineError(503, message));
        if (this.worker !== worker) return;
        this.worker = undefined; this.state = 'failed'; this.lastError = message; this.restarts++;
        recordSystemEvent('inference_worker_failure', { model: this.selected, restarts: this.restarts });
        const job = this.current; this.current = undefined;
        if (job) { job.cleanup();clearTimeout(job.cancellationTimer);job.reject(new EngineError(503, 'Embedded inference worker stopped')); }
        if (this.queue.length && !this.closing) setTimeout(() => { void this.pump(); }, 1000).unref();
      };
      worker.once('error', error => fail(error.message));
      worker.once('exit', code => fail(`Inference worker exited (${code})`));
    });
  }
  generate(input: Generation): Promise<GenerationResult> {
    if (input.signal?.aborted) return Promise.reject(input.signal.reason);
    if (this.paused || this.switching) return Promise.reject(new EngineError(503, 'Inference is paused or changing models'));
    if (!Array.isArray(input.messages) || !input.messages.length || input.messages.some(m => !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string') || !Number.isInteger(input.maxTokens ?? 256) || (input.maxTokens ?? 256) < 1 || (input.maxTokens ?? 256) > 2048) return Promise.reject(new EngineError(400, 'Invalid generation input'));
    if (!listLocalModels().some(m => m.id === input.model)) return Promise.reject(new EngineError(404, 'Local model not installed'));
    if (input.model !== this.selected) return Promise.reject(new EngineError(409, 'Select this model in AMU administration before inference'));
    if (this.closing || this.queue.length >= 16) return Promise.reject(new EngineError(429, 'AMU inference queue unavailable or full'));
    return new Promise((resolve, reject) => {
      const job: Job = { id: crypto.randomUUID(), input, resolve, reject, cleanup: () => {}, cancel: () => {} };
      const abort = (reason?: unknown) => {
        if(job.cancelling)return;
        this.cancelled++;
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        if (this.current === job) {
          job.cancelling=true;this.worker?.send({type:'cancel',id:job.id});
          job.cancellationTimer=setTimeout(()=>{if(this.current===job&&this.worker)void stopProcess(this.worker);},3000);job.cancellationTimer.unref();
        }
        job.cleanup(); reject(reason instanceof Error ? reason : input.signal?.reason || new EngineError(504, 'Generation deadline exceeded'));
      };
      const timer = setTimeout(abort, 120000);
      job.cancel = abort;
      job.cleanup = () => { clearTimeout(timer); input.signal?.removeEventListener('abort', abort); };
      input.signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(job); void this.pump();
    });
  }
  private async pump() {
    if (this.current || !this.queue.length || this.closing) return;
    try { await this.initialize(); }
    catch (error) { for (const job of this.queue.splice(0)) { job.cleanup(); job.reject(error as Error); } return; }
    if (this.current || !this.queue.length || this.closing) return;
    const job = this.queue.shift()!;
    this.current = job;
    this.worker!.send({ type: 'generate', id: job.id, messages: job.input.messages, maxTokens: job.input.maxTokens ?? 256, temperature: job.input.temperature ?? 0.2, responseSchema: job.input.responseSchema });
  }
  async selectModel(id: string) {
    if (this.current || this.queue.length || this.initializing || this.switching) throw new EngineError(409, 'Engine is busy');
    modelPath(id);
    this.switching = true;
    const previous = this.selected;
    const wasPaused = this.paused;
    try {
      const reclaimable = (this.nativeProcess as any)?.memory?.rss || 0;
      const assessment = await assessModel(id, reclaimable); assertMemoryBudget(assessment.estimatedRamBytes, assessment.availableBudgetBytes);
      await this.stopWorker(); this.selected = id; this.state = 'unloaded'; this.paused = false;
      try { await this.initialize(true); } catch (error) { this.selected = previous; this.state = 'unloaded'; this.paused = wasPaused; if (!wasPaused) { try { await this.initialize(true); } catch { /* Health exposes failed restoration. */ } } throw error; }
    } finally { this.switching = false; }
  }
  private async stopWorker() { const w = this.worker; this.worker = undefined; if (w) await stopProcess(w); this.nativeProcess = null; }
  async pause() {
    if (this.current || this.queue.length || this.initializing || this.switching) throw new EngineError(409, 'Stop requires an idle engine; cancel requests first');
    this.paused = true; await this.stopWorker(); this.state = 'paused'; recordSystemEvent('engine_paused');
  }
  async start() { const wasPaused=this.paused;this.paused = false; try{await this.initialize();}catch(e){this.paused=wasPaused;throw e;} }
  async restart() { if (this.current || this.queue.length || this.initializing || this.switching) throw new EngineError(409, 'Restart requires an idle engine'); this.switching = true; try { await this.stopWorker(); this.state = 'unloaded'; this.paused = false; await this.initialize(true); } finally { this.switching = false; } }
  cancel(id: string) { const job = [this.current, ...this.queue].find(j => j?.id === id); if (!job) throw new EngineError(404, 'Inference request not found'); job.cancel(new EngineError(499,'Generation cancelled by operator')); return true; }
  async enforceMemoryPressure(freeBytes=os.freemem()) {
    if(freeBytes>=512*1024**2||!this.worker||this.paused||this.closing||this.switching)return false;
    this.paused=true;this.state='memory-pressure';this.lastError='Critical system RAM pressure; AMU inference was unloaded';
    const error=new EngineError(507,this.lastError);for(const job of this.queue.splice(0)){job.cleanup();job.reject(error);}
    if(this.current){this.current.cleanup();clearTimeout(this.current.cancellationTimer);this.current.reject(error);this.current=undefined;}
    await this.stopWorker();this.state='paused-memory-pressure';recordSystemEvent('memory_pressure_unload',{freeBytes});return true;
  }
  async close() {
    this.closing = true;
    clearInterval(this.pressureCheck);
    for (const job of this.queue.splice(0)) { job.cleanup(); job.reject(new EngineError(503, 'Engine shutting down')); }
    if (this.current) { this.current.cleanup();clearTimeout(this.current.cancellationTimer);this.current.reject(new EngineError(503, 'Engine shutting down')); this.current = undefined; }
    await this.stopWorker(); this.state = 'stopped';
  }
}
export const amuInference = new AMUInferenceEngine();
