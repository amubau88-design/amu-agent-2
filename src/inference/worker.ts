const workerData = JSON.parse(process.env.AMU_INFERENCE_CONFIG || '{}');
import {matchesOutputSchema} from './output-schema.ts';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import { getLlama, LlamaChatSession, LlamaLogLevel,resolveChatWrapper,JinjaTemplateChatWrapper } from 'node-llama-cpp';

const port = { postMessage: (message: any) => process.send?.({ ...message, nativeProcess: { pid: process.pid, memory: process.memoryUsage(), cpuUsage:process.cpuUsage(), uptimeSeconds:process.uptime() } }), on: (event: string, listener: (message: any) => void) => process.on(event, listener) };
const fatal=(error:unknown)=>{const message={type:'startup-failure',message:error instanceof Error?error.message.slice(0,500):'Embedded runtime initialization failed'};if(process.connected&&process.send){process.send(message,()=>process.exit(1));setTimeout(()=>process.exit(1),200).unref();}else process.exit(1);};
process.once('uncaughtException',fatal);process.once('unhandledRejection',fatal);
process.on('disconnect', () => process.exit(0));
const checksum = crypto.createHash('sha256');
for await (const chunk of createReadStream(workerData.modelPath)) checksum.update(chunk);
if (checksum.digest('hex') !== workerData.sha256) throw new Error('Model checksum verification failed');
const llama = await getLlama({ gpu: false, build: 'never', skipDownload: true, logLevel: LlamaLogLevel.error, maxThreads: workerData.threads });
const model = await llama.loadModel({ modelPath: workerData.modelPath, gpuLayers: 0 });
const embeddedTemplate=model.fileInfo.metadata.tokenizer?.chat_template;
if(workerData.profile?.template==='gguf-jinja'&&(typeof embeddedTemplate!=='string'||embeddedTemplate.length>65536))throw new Error('Coding profile requires a bounded embedded Jinja chat template');
const chatWrapper=workerData.profile?.template==='gguf-jinja'?new JinjaTemplateChatWrapper({template:embeddedTemplate as string,convertUnsupportedSystemMessagesToUserMessages:false,functionCallMessageTemplate:'noJinja'}):resolveChatWrapper(model,{type:workerData.profile?.template==='chatml'?'chatML':'auto',fallbackToOtherWrappersOnJinjaError:false});
if(!chatWrapper)throw new Error('Model chat template could not be resolved safely');
const context = await model.createContext({ contextSize: workerData.contextSize, sequences: 1, threads: workerData.threads, batchSize: 256 });
port.postMessage({ type: 'ready', gpu: llama.gpu, contextSize: context.contextSize,profileId:workerData.profile?.id||'local-gguf',chatWrapper:chatWrapper.wrapperName,tokenizer:'embedded-gguf',capabilities:{jsonSchema:true,structuredTools:true,nativeToolCalling:false} });
setInterval(() => port.postMessage({ type: 'metrics' }), 5000).unref();
let activeGeneration: {id:string;controller:AbortController} | null = null;
port.on('message', async (job) => {
  if(job.type==='cancel'){if(activeGeneration&&activeGeneration.id===job.id)activeGeneration.controller.abort(Object.assign(new Error('Generation cancelled'),{status:499}));return;}
  if (job.type !== 'generate') return;
  if(activeGeneration){port.postMessage({type:'failure',id:job.id,status:409,message:'Native sequence is busy'});return;}
  const controller=new AbortController();activeGeneration={id:job.id,controller};
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ contextSequence: sequence,chatWrapper });
  const started = Date.now();
  let firstTokenMs = 0;
  let response: object;
  try {
    const messages = job.responseSchema?[{role:'system',content:'Respond with one complete JSON object matching this schema: '+JSON.stringify(job.responseSchema)},...job.messages]:job.messages;
    if (messages.at(-1)?.role !== 'user') throw Object.assign(new Error('Last message must be a user message'), { status: 400 });
    const inputTokens = messages.reduce((n: number, m: any) => n + model.tokenize(m.content).length + 16, 32);
    if (inputTokens + job.maxTokens > Math.min(workerData.contextSize,job.maxContextTokens||workerData.contextSize)) throw Object.assign(new Error('Messages and max_tokens exceed context capacity'), { status: 400 });
    session.setChatHistory(messages.slice(0, -1).map((m: any) => m.role === 'assistant' ? { type: 'model', response: [m.content] } : { type: m.role, text: m.content }));
    const before = sequence.tokenMeter.getState();
    const content = await session.prompt(messages.at(-1).content, {
      maxTokens: job.maxTokens, temperature: job.temperature,
      signal: controller.signal,
      grammar: job.responseSchema ? await llama.createGrammarForJsonSchema(job.responseSchema) : undefined,
      onTextChunk(text) {
        if (!firstTokenMs) firstTokenMs = Date.now() - started;
        port.postMessage({ type: 'chunk', id: job.id, text });
      },
    });
    if(job.responseSchema){try{if(!matchesOutputSchema(JSON.parse(content),job.responseSchema))throw Error('Schema mismatch');}catch{throw Object.assign(new Error('Structured output did not complete or match its schema within the token limit'),{status:422});}}
    const after = sequence.tokenMeter.getState();
    const usage = { prompt_tokens: after.usedInputTokens - before.usedInputTokens, completion_tokens: after.usedOutputTokens - before.usedOutputTokens };
    response = { type: 'result', id: job.id, content, usage, finishReason: usage.completion_tokens >= job.maxTokens ? 'length' : 'stop', ttftMs: firstTokenMs, durationMs: Date.now() - started };
  } catch (error) {
    response = { type: 'failure', id: job.id, message: (error as Error).message, status: (error as any).status || 503 };
  } finally { session.dispose(); await sequence.dispose(); activeGeneration=null; }
  port.postMessage(response!);
});
