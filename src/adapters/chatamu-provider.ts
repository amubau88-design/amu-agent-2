import type { TaskResult, APIResponse, RuntimeStatus } from '../shared/types.ts';

export interface ChatAMUProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class ChatAMUProviderAdapter {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(options: ChatAMUProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:3030').replace(/\/$/, '');
    this.apiKey = options.apiKey || process.env.AMU_API_KEY || '';
    this.timeoutMs = options.timeoutMs || 30000;
  }

  public async getHealth(): Promise<{ healthy: boolean; version: string }> {
    const res = await this.request<APIResponse<{ status: string; version: string }>>('/api/v1/health', 'GET');
    return {
      healthy: res.data?.status === 'healthy',
      version: res.data?.version || 'unknown',
    };
  }

  public async getStatus(): Promise<RuntimeStatus> {
    const res = await this.request<APIResponse<RuntimeStatus>>('/api/v1/runtime/status', 'GET');
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to fetch runtime status');
    }
    return res.data;
  }

  public async generateChat(prompt: string, options?: Record<string, unknown>): Promise<TaskResult> {
    const res = await this.request<APIResponse<TaskResult>>('/api/v1/chat', 'POST', {
      prompt,
      options,
    });
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to process chat request');
    }
    return res.data;
  }

  public async generateOpenAIChat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ content: string; model: string }> {
    const res = await this.request<{ choices: Array<{ message: { content: string } }>; model: string }>('/v1/chat/completions', 'POST', {
      messages,
      model: 'amu-agent-2-default',
    });
    return {
      content: res.choices[0]?.message?.content || '',
      model: res.model,
    };
  }

  public async submitTask(prompt: string, options?: Record<string, unknown>): Promise<TaskResult> {
    const res = await this.request<APIResponse<TaskResult>>('/api/v1/agent/tasks', 'POST', {
      prompt,
      options,
    });
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Failed to submit agent task');
    }
    return res.data;
  }

  public async getTaskById(taskId: string): Promise<TaskResult> {
    const res = await this.request<APIResponse<TaskResult>>(`/api/v1/agent/tasks/${taskId}`, 'GET');
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || `Task '${taskId}' not found`);
    }
    return res.data;
  }

  private async request<T>(endpoint: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
    if (!this.apiKey) throw new Error('An AMU client API key is required');
    const headers: Record<string, string> = {
      'X-AMU-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };

    if (method === 'POST' && body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, config);
    if (!response.ok && response.status !== 400 && response.status !== 404) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    return await response.json() as T;
  }
}
