import type { AIRuntimeRequest, AIRuntimeResponse } from '../shared/types.ts';

export interface AIRuntimeStreamChunk {
  delta: string;
  finishReason?: string;
  metrics?: {
    ttftMs: number;
    totalDurationMs: number;
  };
}

export interface AIRuntimeAdapter {
  id: string;
  name: string;
  isHealthy(): Promise<boolean>;
  generate(request: AIRuntimeRequest): Promise<AIRuntimeResponse>;
  generateStream(
    request: AIRuntimeRequest,
    onChunk: (chunk: AIRuntimeStreamChunk) => void
  ): Promise<AIRuntimeResponse>;
  getModelInfo(): { id: string; name: string; contextWindow: number; isLocal: boolean };
}
