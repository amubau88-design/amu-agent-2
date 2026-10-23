import type { AIRuntimeAdapter, AIRuntimeStreamChunk } from './interface.ts';
import type { AIRuntimeRequest, AIRuntimeResponse } from '../shared/types.ts';

export class MockLocalRuntimeAdapter implements AIRuntimeAdapter {
  public id = 'amu-local-mock';
  public name = 'AMU Native Local Lightweight Model (Engine Engine)';

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public getModelInfo() {
    return {
      id: 'amu-deepmind-local-v1',
      name: 'AMU Local Developer Model v1',
      contextWindow: 128000,
      isLocal: true,
    };
  }

  public async generate(request: AIRuntimeRequest): Promise<AIRuntimeResponse> {
    const startTime = Date.now();
    const ttftMs = Math.floor(Math.random() * 5) + 3; // Fast 3-8ms TTFT
    
    const userMessage = request.messages.find(m => m.role === 'user')?.content || '';
    const content = this.synthesizeResponse(userMessage);

    const durationMs = Date.now() - startTime;
    const promptTokens = Math.ceil((request.systemPrompt?.length || 0 + userMessage.length) / 4);
    const completionTokens = Math.ceil(content.length / 4);

    return {
      content,
      model: this.getModelInfo().id,
      finishReason: 'stop',
      metrics: {
        ttftMs,
        totalDurationMs: durationMs,
        modelLoadTimeMs: 0,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  public async generateStream(
    request: AIRuntimeRequest,
    onChunk: (chunk: AIRuntimeStreamChunk) => void
  ): Promise<AIRuntimeResponse> {
    const startTime = Date.now();
    const ttftMs = Math.floor(Math.random() * 5) + 3;
    const userMessage = request.messages.find(m => m.role === 'user')?.content || '';
    const fullContent = this.synthesizeResponse(userMessage);

    // Simulate chunk streaming
    const words = fullContent.split(' ');
    onChunk({ delta: '', metrics: { ttftMs, totalDurationMs: Date.now() - startTime } });

    for (let i = 0; i < words.length; i++) {
      const delta = (i === 0 ? '' : ' ') + words[i];
      onChunk({ delta });
    }

    const durationMs = Date.now() - startTime;
    const promptTokens = Math.ceil((request.systemPrompt?.length || 0 + userMessage.length) / 4);
    const completionTokens = Math.ceil(fullContent.length / 4);

    onChunk({ delta: '', finishReason: 'stop' });

    return {
      content: fullContent,
      model: this.getModelInfo().id,
      finishReason: 'stop',
      metrics: {
        ttftMs,
        totalDurationMs: durationMs,
        modelLoadTimeMs: 0,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  private synthesizeResponse(input: string): string {
    const lower = input.toLowerCase();

    if (lower.includes('hallo') || lower.includes('hi') || lower.includes('guten tag')) {
      return 'Hallo! Ich bin der AMU-Agent-2. Wie kann ich dir heute bei der Softwareentwicklung helfen?';
    }

    if (lower.includes('was ist') || lower.includes('erkläre') || lower.includes('wissen')) {
      return 'AMU-Agent-2 ist eine eigenständige, leistungsfähige KI-Entwicklungsplattform mit modularer Agent Engine, versionierter API und austauschbarer AI Runtime.';
    }

    if (lower.includes('funktion') || lower.includes('code') || lower.includes('schreibe')) {
      return `Here is the requested implementation:

\`\`\`typescript
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\``;
    }

    if (lower.includes('debug') || lower.includes('fehler') || lower.includes('repair')) {
      return `DEBUG DIAGNOSIS:
The error occurs due to an unhandled null check or syntax mismatch.
REPAIR ACTION: Added optional chaining and guard validation.
VERIFICATION: Re-running unit tests... tests passed successfully.`;
    }

    return `Standard response generated for task: ${input.substring(0, 100)}`;
  }
}
