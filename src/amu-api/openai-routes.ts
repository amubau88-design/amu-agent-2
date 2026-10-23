import crypto from 'node:crypto';
import { agentOrchestrator } from '../agent-engine/orchestrator.ts';
import { aiRuntimeManager } from '../ai-runtime/runtime-manager.ts';
import type { RequestContext } from './routes.ts';

export interface OpenAIChatCompletionRequest {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: 'stop' | 'length' | 'tool_calls';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  amu_metadata?: {
    tier: string;
    routeReason: string;
    loadedToolsCount: number;
    ttftMs: number;
    totalDurationMs: number;
  };
}

export async function handleOpenAiRequest(
  method: string,
  pathname: string,
  body: Record<string, unknown> | null,
  context: RequestContext
): Promise<{ statusCode: number; response: Record<string, unknown> }> {

  // 1. GET /v1/models
  if (method === 'GET' && pathname === '/v1/models') {
    const status = await aiRuntimeManager.getStatus();
    return {
      statusCode: 200,
      response: {
        object: 'list',
        data: [
          {
            id: 'amu-agent-2-default',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'amu-local',
            permission: [],
            root: status.model,
          },
          {
            id: status.model,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'amu-local',
            permission: [],
            root: status.model,
          },
        ],
      },
    };
  }

  // 2. POST /v1/chat/completions
  if (method === 'POST' && pathname === '/v1/chat/completions') {
    const reqBody = body as unknown as OpenAIChatCompletionRequest;
    if (!reqBody || !Array.isArray(reqBody.messages) || reqBody.messages.length === 0) {
      return {
        statusCode: 400,
        response: {
          error: {
            message: 'Field "messages" array is required.',
            type: 'invalid_request_error',
            param: 'messages',
            code: 'missing_required_field',
          },
        },
      };
    }

    // Extract user prompt from last user message or combined messages
    const userMessage = [...reqBody.messages].reverse().find(m => m.role === 'user')?.content || '';

    // Execute via AMU Agent Orchestrator
    const result = await agentOrchestrator.executeTask(
      { prompt: userMessage },
      context.correlationId,
      context.requestId
    );

    const openAiResponse: OpenAIChatCompletionResponse = {
      id: `chatcmpl-${result.taskId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: reqBody.model || 'amu-agent-2-default',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.finalOutput,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: result.metrics.promptTokens,
        completion_tokens: result.metrics.completionTokens,
        total_tokens: result.metrics.promptTokens + result.metrics.completionTokens,
      },
      amu_metadata: {
        tier: result.tier,
        routeReason: result.routeReason,
        loadedToolsCount: result.loadedToolsCount,
        ttftMs: result.metrics.ttftMs,
        totalDurationMs: result.metrics.totalDurationMs,
      },
    };

    return {
      statusCode: 200,
      response: openAiResponse as unknown as Record<string, unknown>,
    };
  }

  return {
    statusCode: 404,
    response: {
      error: {
        message: `Unknown OpenAI API endpoint: ${method} ${pathname}`,
        type: 'invalid_request_error',
      },
    },
  };
}
