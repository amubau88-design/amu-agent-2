import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { EngineError, hardware, listLocalModels, modelPath } from './models.ts';
import { recordSystemEvent } from '../core/monitoring.ts';
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Generation = { model: string; messages: Message[]; maxTokens?: number; temperature?: number; signal?: AbortSignal; onChunk?: (text: string) => void; responseSchema?: object };
export type GenerationResult = { content: string; usage: { prompt_tokens: number; completion_tokens: number }; finishReason: 'stop' | 'length'; ttftMs: number; durationMs: number };

type Job = { id: string; input: Generation; resolve: (r: GenerationResult) => void; reject: (e: Error) => void; cleanup: () => void };
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
  private nativeProcess: object | null = null;
  private closing = false;
  status() { return { backend: 'amu-embedded-llama.cpp', state: this.state, ready: this.state === 'ready', model: this.selected, active: this.current ? 1 : 0, queued: this.queue.length, restarts: this.restarts, completed: this.completed, lastError: this.lastError, nativeProcess: this.nativeProcess, hardware }; }
  async initialize(): Promise<void> {
    if (this.closing) throw new EngineError(503, 'Engine is shutting down');
    if (this.state === 'ready') return;
    if (this.initializing) return this.initializing;
    this.initializing = this.load().finally(() => { this.initializing = undefined; });
    return this.initializing;
  }
  private async load() {
    const model = listLocalModels().find(m => m.id === this.selected);
    if (!model) throw new EngineError(503, 'No AMU model installed; import a GGUF model first');
    if (this.worker) await stopProcess(this.worker);
    this.state = 'loading';
    const entry = new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url);
    const worker = fork(fileURLToPath(entry), [], { execArgv: ['--experimental-strip-types'], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, AMU_INFERENCE_CONFIG: JSON.stringify({ modelPath: modelPath(model.id), sha256: model.sha256, ...hardware }) } });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new EngineError(504, 'Embedded model load deadline exceeded')); void stopProcess(worker); }, 90000);
      worker.on('message', (message: any) => {
        if (this.worker !== worker) return;
        if (message.nativeProcess) this.nativeProcess = message.nativeProcess;
        if (message.type === 'ready') { clearTimeout(timer); this.state = 'ready'; this.lastError = null; resolve(); }
        else if (this.current && message.id === this.current.id) {
          if (message.type === 'chunk') {
            try { this.current?.input.onChunk?.(message.text); }
            catch { const job = this.current; this.current = undefined; job?.cleanup(); job?.reject(new EngineError(503, 'Streaming output failed')); const w = this.worker; this.worker = undefined; this.state = 'unloaded'; if (w) void stopProcess(w).finally(() => this.pump()); }
          }
          else {
            const job = this.current!; this.current = undefined; job.cleanup();
            if (message.type === 'result') { this.completed++; job.resolve(message); }
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
        if (job) { job.cleanup(); job.reject(new EngineError(503, 'Embedded inference worker stopped')); }
        if (this.queue.length && !this.closing) setTimeout(() => { void this.pump(); }, 1000).unref();
      };
      worker.once('error', error => fail(error.message));
      worker.once('exit', code => fail(`Inference worker exited (${code})`));
    });
  }
  generate(input: Generation): Promise<GenerationResult> {
    if (input.signal?.aborted) return Promise.reject(input.signal.reason);
    if (!listLocalModels().some(m => m.id === input.model)) return Promise.reject(new EngineError(404, 'Local model not installed'));
    if (input.model !== this.selected) return Promise.reject(new EngineError(409, 'Select this model in AMU administration before inference'));
    if (this.closing || this.queue.length >= 16) return Promise.reject(new EngineError(429, 'AMU inference queue unavailable or full'));
    return new Promise((resolve, reject) => {
      const job: Job = { id: crypto.randomUUID(), input, resolve, reject, cleanup: () => {} };
      const abort = () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        if (this.current === job) { this.current = undefined; const w = this.worker; this.worker = undefined; this.state = 'unloaded'; this.restarts++; if (w) void stopProcess(w).finally(() => this.pump()); }
        job.cleanup(); reject(input.signal?.reason || new EngineError(504, 'Generation deadline exceeded'));
      };
      const timer = setTimeout(abort, 120000);
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
    if (this.current || this.queue.length || this.initializing) throw new EngineError(409, 'Engine is busy');
    modelPath(id);
    const previous = this.selected;
    await this.stopWorker(); this.selected = id; this.state = 'unloaded';
    try { await this.initialize(); } catch (error) { this.selected = previous; this.state = 'unloaded'; throw error; }
  }
  private async stopWorker() { const w = this.worker; this.worker = undefined; if (w) await stopProcess(w); }
  async close() {
    this.closing = true;
    for (const job of this.queue.splice(0)) { job.cleanup(); job.reject(new EngineError(503, 'Engine shutting down')); }
    if (this.current) { this.current.cleanup(); this.current.reject(new EngineError(503, 'Engine shutting down')); this.current = undefined; }
    await this.stopWorker(); this.state = 'stopped';
  }
}
export const amuInference = new AMUInferenceEngine();
