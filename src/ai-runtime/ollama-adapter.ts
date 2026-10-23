import type { AIRuntimeAdapter, AIRuntimeStreamChunk } from './interface.ts';
import type { AIRuntimeRequest, AIRuntimeResponse } from '../shared/types.ts';
import { StructuredLogger } from '../shared/logger.ts';

const logger = new StructuredLogger('ollama-adapter', 'ai-runtime');

export class OllamaRuntimeAdapter implements AIRuntimeAdapter {
  public id = 'ollama';
  public name = 'Ollama Local AI Runtime';
  private baseUrl: string;
  private modelName: string;
  private initialized = false;

  constructor(baseUrl: string = 'http://127.0.0.1:11434', preferredModel: string = 'qwen2.5:1.5b') {
    this.baseUrl = baseUrl;
    this.modelName = preferredModel;
  }

  public async autoDetectModel(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string; model: string }> };
        const available = (data.models || []).map(m => m.name || m.model);
        
        // Prefer qwen2.5:1.5b for CPU responsiveness, fallback to qwen2.5:3b or first available
        if (available.includes('qwen2.5:1.5b')) {
          this.modelName = 'qwen2.5:1.5b';
        } else if (available.includes('qwen2.5:3b')) {
          this.modelName = 'qwen2.5:3b';
        } else if (available.length > 0) {
          this.modelName = available[0];
        }
        this.initialized = true;
        logger.info(`Ollama Auto-Detection: Aktives lokales Modell '${this.modelName}' ausgewählt.`);
      }
    } catch {
      // Best-effort
    }
    return this.modelName;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        if (!this.initialized) await this.autoDetectModel();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public getModelInfo() {
    return {
      id: this.modelName,
      name: `Ollama Local (${this.modelName})`,
      contextWindow: 32768,
      isLocal: true,
    };
  }

  public async generate(request: AIRuntimeRequest): Promise<AIRuntimeResponse> {
    if (!this.initialized) await this.autoDetectModel();
    const startTime = Date.now();
    const prompt = request.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: 256, // Keep completions concise for CPU efficiency
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama HTTP Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json() as { response: string; eval_count?: number; prompt_eval_count?: number };
      const durationMs = Date.now() - startTime;

      return {
        content: data.response.trim(),
        model: this.modelName,
        finishReason: 'stop',
        metrics: {
          ttftMs: Math.floor(durationMs * 0.2),
          totalDurationMs: durationMs,
          modelLoadTimeMs: 0,
          promptTokens: data.prompt_eval_count || Math.ceil(prompt.length / 4),
          completionTokens: data.eval_count || Math.ceil(data.response.length / 4),
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Ollama Adapter Failed: ${error.message}`);
    }
  }

  public async generateStream(
    request: AIRuntimeRequest,
    onChunk: (chunk: AIRuntimeStreamChunk) => void
  ): Promise<AIRuntimeResponse> {
    const response = await this.generate(request);
    onChunk({ delta: response.content, finishReason: 'stop' });
    return response;
  }
}

