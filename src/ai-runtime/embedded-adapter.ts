import type { AIRuntimeAdapter, AIRuntimeStreamChunk } from './interface.ts';
import type { AIRuntimeRequest, AIRuntimeResponse } from '../shared/types.ts';
import { amuInference } from '../inference/engine.ts';
export class AMUEmbeddedAdapter implements AIRuntimeAdapter {
  id = 'amu-embedded';
  name = 'AMU Embedded Inference';
  async isHealthy() { try { await amuInference.initialize(); return amuInference.status().ready; } catch { return false; } }
  getModelInfo() { return { id: amuInference.status().model || 'not-installed', name: 'AMU local GGUF', contextWindow: amuInference.status().hardware.contextSize, isLocal: true }; }
  async generate(request: AIRuntimeRequest): Promise<AIRuntimeResponse> { return this.generateStream(request, () => {}); }
  async generateStream(request: AIRuntimeRequest, onChunk: (chunk: AIRuntimeStreamChunk) => void): Promise<AIRuntimeResponse> {
    const messages = [...request.messages];
    if (request.systemPrompt) messages.unshift({ role: 'system', content: request.systemPrompt });
    const result = await amuInference.generate({ model: this.getModelInfo().id, messages, temperature: request.temperature, maxTokens: Math.min(request.maxTokens || 256, 2048), onChunk: delta => onChunk({ delta }) });
    return { content: result.content, model: this.getModelInfo().id, finishReason: result.finishReason, metrics: { ttftMs: result.ttftMs, totalDurationMs: result.durationMs, modelLoadTimeMs: 0, promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens, totalTokens: result.usage.prompt_tokens + result.usage.completion_tokens } };
  }
}
