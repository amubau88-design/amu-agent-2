/**
 * AMU-Agent-2 Core Types & Interfaces
 */

export type TaskTier = 'GREETING' | 'KNOWLEDGE' | 'CODE' | 'DEBUG' | 'FULL_AGENT';

export type TaskState = 
  | 'UNDERSTAND'
  | 'PLAN'
  | 'EXECUTE'
  | 'VERIFY'
  | 'REPAIR'
  | 'RESULT'
  | 'FAILED';

export interface RouteDecision {
  tier: TaskTier;
  reason: string;
  loadedTools: string[];
  contextStrategy: 'minimal' | 'knowledge' | 'coding' | 'debug' | 'full';
  maxTokens: number;
  temperature: number;
}

export interface AIMetrics {
  ttftMs: number;               // Time to First Token
  totalDurationMs: number;      // Total execution time
  modelLoadTimeMs: number;       // Model load time if available
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIRuntimeRequest {
  systemPrompt?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AIRuntimeResponse {
  content: string;
  metrics: AIMetrics;
  model: string;
  finishReason: 'stop' | 'length' | 'tool_call' | 'error';
}

export interface CapabilityPermission {
  allowedPaths: string[];
  deniedPaths: string[];
  allowCommandExecution: boolean;
  allowedCommands?: string[];
  allowFileDeletion: boolean;
  allowNetworkAccess: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'file' | 'cmd' | 'test' | 'build' | 'verify';
  parameters: Record<string, unknown>;
  requiredPermissions: string[];
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface TaskStepPlan {
  stepIndex: number;
  description: string;
  action: 'analyze' | 'tool' | 'verify' | 'synthesize';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface TaskRequest {
  prompt: string;
  context?: Record<string, unknown>;
  options?: {
    forceTier?: TaskTier;
    maxIterations?: number;
    timeoutMs?: number;
    capabilityOverrides?: Partial<CapabilityPermission>;
  };
}

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed';
  finalOutput: string;
  tier: TaskTier;
  routeReason: string;
  loadedToolsCount: number;
  loadedTools: string[];
  iterations: number;
  statesVisited: TaskState[];
  verificationPassed: boolean;
  metrics: {
    totalDurationMs: number;
    ttftMs: number;
    aiRuntimeTimeMs: number;
    toolExecutionTimeMs: number;
    promptTokens: number;
    completionTokens: number;
    model: string;
  };
  auditTrail: AuditEvent[];
}

export interface AuditEvent {
  timestamp: string;
  correlationId: string;
  requestId: string;
  eventType: string;
  details: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  requestId: string;
  correlationId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface RuntimeStatus {
  activeBackend: string;
  model: string;
  healthy: boolean;
  lanWorkers: number;
  activeTasks: number;
  uptimeSeconds: number;
}
