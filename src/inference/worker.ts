const workerData = JSON.parse(process.env.AMU_INFERENCE_CONFIG || '{}');
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import { getLlama, LlamaChatSession, LlamaLogLevel } from 'node-llama-cpp';

const port = { postMessage: (message: any) => process.send?.({ ...message, nativeProcess: { pid: process.pid, memory: process.memoryUsage() } }), on: (event: string, listener: (message: any) => void) => process.on(event, listener) };
process.on('disconnect', () => process.exit(0));
const checksum = crypto.createHash('sha256');
for await (const chunk of createReadStream(workerData.modelPath)) checksum.update(chunk);
if (checksum.digest('hex') !== workerData.sha256) throw new Error('Model checksum verification failed');
const llama = await getLlama({ gpu: false, build: 'never', skipDownload: true, logLevel: LlamaLogLevel.error, maxThreads: workerData.threads });
const model = await llama.loadModel({ modelPath: workerData.modelPath, gpuLayers: 0 });
const context = await model.createContext({ contextSize: workerData.contextSize, sequences: 1, threads: workerData.threads, batchSize: 256 });
port.postMessage({ type: 'ready', gpu: llama.gpu, contextSize: context.contextSize });
setInterval(() => port.postMessage({ type: 'metrics' }), 5000).unref();
port.on('message', async (job) => {
  if (job.type !== 'generate') return;
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ contextSequence: sequence });
  const started = Date.now();
  let firstTokenMs = 0;
  let response: object;
  try {
    const messages = job.messages;
    if (messages.at(-1)?.role !== 'user') throw Object.assign(new Error('Last message must be a user message'), { status: 400 });
    const inputTokens = messages.reduce((n: number, m: any) => n + model.tokenize(m.content).length + 16, 32);
    if (inputTokens + job.maxTokens > workerData.contextSize) throw Object.assign(new Error('Messages and max_tokens exceed context capacity'), { status: 400 });
    session.setChatHistory(messages.slice(0, -1).map((m: any) => m.role === 'assistant' ? { type: 'model', response: [m.content] } : { type: m.role, text: m.content }));
    const before = sequence.tokenMeter.getState();
    const content = await session.prompt(messages.at(-1).content, {
      maxTokens: job.maxTokens, temperature: job.temperature,
      grammar: job.responseSchema ? await llama.createGrammarForJsonSchema(job.responseSchema) : undefined,
      onTextChunk(text) {
        if (!firstTokenMs) firstTokenMs = Date.now() - started;
        port.postMessage({ type: 'chunk', id: job.id, text });
      },
    });
    const after = sequence.tokenMeter.getState();
    const usage = { prompt_tokens: after.usedInputTokens - before.usedInputTokens, completion_tokens: after.usedOutputTokens - before.usedOutputTokens };
    response = { type: 'result', id: job.id, content, usage, finishReason: usage.completion_tokens >= job.maxTokens ? 'length' : 'stop', ttftMs: firstTokenMs, durationMs: Date.now() - started };
  } catch (error) {
    response = { type: 'failure', id: job.id, message: (error as Error).message, status: (error as any).status || 503 };
  } finally { session.dispose(); await sequence.dispose(); }
  port.postMessage(response!);
});
