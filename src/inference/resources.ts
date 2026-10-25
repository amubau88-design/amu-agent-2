import {platform} from '../central/platform.ts';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {codingProfile,validateProfileMetadata} from './profiles.ts';
import { readGgufFileInfo } from 'node-llama-cpp';
import { EngineError, hardware, listLocalModels, modelPath } from './models.ts';
export type ModelAssessment = { id: string; bytes: number; architecture: string; contextSize: number; estimatedRamBytes: number; availableBudgetBytes: number; loadable: boolean; reason: string; estimateOnly: true;tokenizer:string;chatTemplateSha256:string|null;trainedContext:number|null };
const metadataCache = new Map<string, { key: string; estimatedRamBytes: number; architecture: string;tokenizer:string;chatTemplateSha256:string|null;trainedContext:number|null }>();
export function memoryBudget(total = os.totalmem(), free = os.freemem(), reclaimable = 0) {
  return Math.max(0, Math.min(total * platform.memoryFraction, free + reclaimable - Math.max(platform.reserveMiB*1024**2, total * 0.1)));
}
export function assertMemoryBudget(estimated: number, budget: number) { if (!Number.isFinite(estimated) || estimated <= 0 || estimated > budget) throw new EngineError(507, 'Model and context exceed the safe RAM budget; the active model was not changed'); }
export async function assessModel(id: string, reclaimable = 0, contextSize=hardware.contextSize): Promise<ModelAssessment> {
  const entry = listLocalModels().find(m => m.id === id);
  if (!entry) throw new EngineError(404, 'Model is not registered');
  const file = modelPath(id); const stat = fs.statSync(file); const key = `${stat.size}:${stat.mtimeMs}:${contextSize}:${entry.profileId||'local-gguf'}`;
  let estimate = metadataCache.get(id);
  if (estimate?.key !== key) {
    const info = await readGgufFileInfo(file, { sourceType: 'filesystem', readTensorInfo: false, logWarnings: false, ignoreKeys: ['tokenizer.ggml.tokens','tokenizer.ggml.merges','tokenizer.ggml.token_type'] });
    const metadata = info.metadata as any; const architecture = metadata.general?.architecture || 'unknown'; const config = metadata[architecture];
    const profile=codingProfile(entry.profileId||'local-gguf');validateProfileMetadata(profile,metadata);
    const template=metadata.tokenizer?.chat_template;
    const layers = config?.block_count; const embedding = config?.embedding_length; const heads = config?.attention?.head_count; const kvHeads = config?.attention?.head_count_kv || heads;
    if (![layers, embedding, heads, kvHeads].every(v => Number.isFinite(v) && v > 0)) throw new EngineError(422, 'Model metadata does not support a conservative RAM estimate');
    const trainedContext = config.context_length;
    if (trainedContext && trainedContext < contextSize) throw new EngineError(422, 'Model context capacity is smaller than the configured context');
    const keyLength=Math.max(config.attention?.key_length||0,profile.headDimension||0,embedding/heads),valueLength=Math.max(config.attention?.value_length||0,profile.headDimension||0,embedding/heads);
    const kv = contextSize * layers * (keyLength+valueLength) * kvHeads * 2;
    estimate = { key, architecture, estimatedRamBytes: Math.ceil(entry.bytes * 1.2 + kv + 512 * 1024 ** 2),tokenizer:metadata.tokenizer?.ggml?.model||'unknown',chatTemplateSha256:typeof template==='string'?crypto.createHash('sha256').update(template).digest('hex'):null,trainedContext:Number.isFinite(trainedContext)?trainedContext:null }; metadataCache.set(id, estimate);
  }
  const availableBudgetBytes = memoryBudget(os.totalmem(), os.freemem(), reclaimable);
  return { id, bytes: entry.bytes, architecture: estimate.architecture, contextSize: contextSize, estimatedRamBytes: estimate.estimatedRamBytes, availableBudgetBytes, loadable: estimate.estimatedRamBytes <= availableBudgetBytes, reason: estimate.estimatedRamBytes <= availableBudgetBytes ? 'Within conservative RAM budget' : 'Insufficient free RAM after system reserve', estimateOnly: true,tokenizer:estimate.tokenizer,chatTemplateSha256:estimate.chatTemplateSha256,trainedContext:estimate.trainedContext };
}
export function modelRegistrySummary() { return listLocalModels().map(m => ({ ...m, path: path.join('scratch/models', m.filename) })); }
