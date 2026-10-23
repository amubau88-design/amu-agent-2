import type { AIRuntimeAdapter } from './interface.ts';
import { AMUEmbeddedAdapter } from './embedded-adapter.ts';
import { MockLocalRuntimeAdapter } from './mock-adapter.ts';
import { OllamaRuntimeAdapter } from './ollama-adapter.ts';
import { OpenAICompatibleRuntimeAdapter } from './openai-adapter.ts';
import type { RuntimeStatus } from '../shared/types.ts';

export class AIRuntimeManager {
  private adapters: Map<string, AIRuntimeAdapter> = new Map();
  private activeAdapterId: string;
  private startTime: number = Date.now();

  constructor() {
    // Legacy adapters remain available explicitly. Production uses embedded inference.
    const mock = new MockLocalRuntimeAdapter();
    this.adapters.set(mock.id, mock);

    const ollama = new OllamaRuntimeAdapter();
    this.adapters.set(ollama.id, ollama);

    const openai = new OpenAICompatibleRuntimeAdapter();
    this.adapters.set(openai.id, openai);

    const embedded = new AMUEmbeddedAdapter();
    this.adapters.set(embedded.id, embedded);
    this.activeAdapterId = embedded.id;
  }

  public registerAdapter(adapter: AIRuntimeAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public setActiveAdapter(id: string): void {
    if (!this.adapters.has(id)) {
      throw new Error(`AI Runtime adapter with id '${id}' is not registered.`);
    }
    this.activeAdapterId = id;
  }

  public getActiveAdapter(): AIRuntimeAdapter {
    const adapter = this.adapters.get(this.activeAdapterId);
    if (!adapter) {
      throw new Error(`Active adapter '${this.activeAdapterId}' not found.`);
    }
    return adapter;
  }

  public async getStatus(): Promise<RuntimeStatus> {
    const adapter = this.getActiveAdapter();
    const healthy = await adapter.isHealthy();
    const info = adapter.getModelInfo();

    return {
      activeBackend: adapter.name,
      model: info.id,
      healthy,
      lanWorkers: 1, // Single-node default, ready for multi-node LAN expansion
      activeTasks: 0,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public listAdapters(): Array<{ id: string; name: string; isLocal: boolean }> {
    return Array.from(this.adapters.values()).map(a => ({
      id: a.id,
      name: a.name,
      isLocal: a.getModelInfo().isLocal,
    }));
  }
}

export const aiRuntimeManager = new AIRuntimeManager();
