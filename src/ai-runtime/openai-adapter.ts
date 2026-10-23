import type { AIRuntimeAdapter, AIRuntimeStreamChunk } from './interface.ts';
import type { AIRuntimeRequest, AIRuntimeResponse } from '../shared/types.ts';

export class OpenAICompatibleRuntimeAdapter implements AIRuntimeAdapter {
  public id = 'openai-compatible';
  public name = 'Generic OpenAI-Compatible Local Backend';
  private baseUrl: string;
  private apiKey: string;
  private modelName: string;

  constructor(baseUrl: string = 'http://127.0.0.1:1234/v1', modelName: string = 'local-model', apiKey: string = 'lm-studio') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public getModelInfo() {
    return {
      id: this.modelName,
      name: `OpenAI-Compatible (${this.modelName})`,
      contextWindow: 128000,
      isLocal: true,
    };
  }

  public async generate(request: AIRuntimeRequest): Promise<AIRuntimeResponse> {
    const startTime = Date.now();

    const body = {
      model: this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 2048,
    };

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`OpenAI Compatible HTTP Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const durationMs = Date.now() - startTime;
      const content = data.choices[0]?.message?.content || '';

      return {
        content,
        model: this.modelName,
        finishReason: (data.choices[0]?.finish_reason as 'stop') || 'stop',
        metrics: {
          ttftMs: Math.floor(durationMs * 0.15),
          totalDurationMs: durationMs,
          modelLoadTimeMs: 0,
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`OpenAI Compatible Adapter Failed: ${error.message}`);
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
