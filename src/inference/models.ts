import {platform} from '../central/platform.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type ModelEntry = { id: string; filename: string; sha256: string; bytes: number; license: string; profileId?:string;registeredAt?:string };
export const modelDirectory = path.resolve(process.env.AMU_MODEL_DIR || 'scratch/models');
export const registryFile = path.join(modelDirectory, 'registry.json');
export function listLocalModels(): ModelEntry[] {
  if (!fs.existsSync(registryFile)) return [];
  const entries: unknown = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid AMU model registry');
  return entries.filter((m): m is ModelEntry => !!m && typeof m.id === 'string' && typeof m.filename === 'string' && !m.filename.includes(':') && path.basename(m.filename) === m.filename && m.filename.endsWith('.gguf') && Number.isSafeInteger(m.bytes) && m.bytes > 0 && /^[a-f0-9]{64}$/.test(m.sha256) && fs.existsSync(path.join(modelDirectory, m.filename)));
}
export function modelPath(id: string): string {
  const entry = listLocalModels().find(m => m.id === id);
  if (!entry) throw new EngineError(404, 'Local model not installed');
  const target = fs.realpathSync(path.join(modelDirectory, entry.filename));
  const relative = path.relative(fs.realpathSync(modelDirectory), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new EngineError(403, 'Model path escapes AMU model directory');
  if (fs.statSync(target).size !== entry.bytes) throw new EngineError(503, 'Model size does not match registry');
  return target;
}
export class EngineError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const hardware = {
  cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), totalMemory: os.totalmem(),
  threads: platform.threads, contextSize: platform.contextSize,
  gpu: false as const, parallelSequences: 1,
};
