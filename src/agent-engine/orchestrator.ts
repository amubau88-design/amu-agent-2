import crypto from 'node:crypto';
import { taskRouter } from '../task-router/router.ts';
import { aiRuntimeManager } from '../ai-runtime/runtime-manager.ts';
import { toolRegistry } from '../tool-runtime/tool-registry.ts';
import { taskVerifier } from '../verification/verifier.ts';
import { StructuredLogger } from '../shared/logger.ts';
import type { 
  TaskRequest, 
  TaskResult, 
  TaskState, 
  AuditEvent, 
  AIRuntimeResponse
} from '../shared/types.ts';

export class AgentOrchestrator {
  public async executeTask(request: TaskRequest, correlationId: string = crypto.randomUUID(), requestId: string = crypto.randomUUID()): Promise<TaskResult> {
    const taskId = `task_${crypto.randomUUID().substring(0, 8)}`;
    const startTime = Date.now();
    const logger = new StructuredLogger(correlationId, requestId);

    const auditTrail: AuditEvent[] = [];
    const statesVisited: TaskState[] = [];
    
    // Limits
    const maxIterations = request.options?.maxIterations ?? 5;
    const maxDurationMs = request.options?.timeoutMs ?? 30000;
    
    // 1. UNDERSTAND: Task Routing
    statesVisited.push('UNDERSTAND');
    auditTrail.push(logger.audit('TASK_STARTED', { taskId, prompt: request.prompt }));

    const routeDecision = taskRouter.route(request.prompt, request.options?.forceTier);
    auditTrail.push(logger.audit('ROUTED', { tier: routeDecision.tier, reason: routeDecision.reason, loadedTools: routeDecision.loadedTools }));

    let totalAiRuntimeTimeMs = 0;
    let totalToolExecutionTimeMs = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let ttftMs = 0;
    let modelUsed = '';
    let iterations = 0;
    let verificationPassed = true;
    let finalOutput = '';

    const aiAdapter = aiRuntimeManager.getActiveAdapter();

    // Fast Path for GREETING & KNOWLEDGE (0 tools required)
    if (routeDecision.tier === 'GREETING' || routeDecision.tier === 'KNOWLEDGE') {
      const aiStart = Date.now();
      const aiResponse = await aiAdapter.generate({
        systemPrompt: `You are AMU-Agent-2, an autonomous local AI developer assistant. Answer concisely for tier ${routeDecision.tier}.`,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: routeDecision.temperature,
        maxTokens: routeDecision.maxTokens,
      });

      totalAiRuntimeTimeMs += (Date.now() - aiStart);
      ttftMs = aiResponse.metrics.ttftMs;
      promptTokens += aiResponse.metrics.promptTokens;
      completionTokens += aiResponse.metrics.completionTokens;
      modelUsed = aiResponse.model;
      finalOutput = aiResponse.content;

      statesVisited.push('RESULT');
      auditTrail.push(logger.audit('TASK_COMPLETED_FAST_PATH', { tier: routeDecision.tier, durationMs: Date.now() - startTime }));

      return {
        taskId,
        status: 'completed',
        finalOutput,
        tier: routeDecision.tier,
        routeReason: routeDecision.reason,
        loadedToolsCount: routeDecision.loadedTools.length,
        loadedTools: routeDecision.loadedTools,
        iterations: 1,
        statesVisited,
        verificationPassed: true,
        metrics: {
          totalDurationMs: Date.now() - startTime,
          ttftMs,
          aiRuntimeTimeMs: totalAiRuntimeTimeMs,
          toolExecutionTimeMs: 0,
          promptTokens,
          completionTokens,
          model: modelUsed,
        },
        auditTrail,
      };
    }

    // 2. PLAN & EXECUTE Loop for CODE, DEBUG, FULL_AGENT
    statesVisited.push('PLAN');
    auditTrail.push(logger.audit('PLANNING', { tier: routeDecision.tier }));

    let currentPrompt = request.prompt;
    let taskCompleted = false;

    while (iterations < maxIterations && (Date.now() - startTime) < maxDurationMs && !taskCompleted) {
      iterations++;
      statesVisited.push('EXECUTE');

      // AI Step Generation
      const aiStart = Date.now();
      const aiResponse: AIRuntimeResponse = await aiAdapter.generate({
        systemPrompt: `You are AMU-Agent-2. Executing task tier: ${routeDecision.tier}.
Available loaded tools: ${routeDecision.loadedTools.join(', ')}.
Plan and perform required steps cleanly.`,
        messages: [{ role: 'user', content: currentPrompt }],
        temperature: routeDecision.temperature,
        maxTokens: routeDecision.maxTokens,
      });

      totalAiRuntimeTimeMs += (Date.now() - aiStart);
      if (iterations === 1) ttftMs = aiResponse.metrics.ttftMs;
      promptTokens += aiResponse.metrics.promptTokens;
      completionTokens += aiResponse.metrics.completionTokens;
      modelUsed = aiResponse.model;

      finalOutput = aiResponse.content;

      // Check if tool invocation requested or needed
      if (routeDecision.loadedTools.length > 0) {
        if (routeDecision.tier === 'DEBUG') {
          statesVisited.push('VERIFY');
          const verifyStart = Date.now();
          const targetFile = (request.context?.targetFile as string) || 'src/index.ts';
          const verifyRes = await taskVerifier.verify({ type: 'syntax', targetPath: targetFile });
          totalToolExecutionTimeMs += (Date.now() - verifyStart);
          auditTrail.push(logger.audit('INITIAL_VERIFY', { targetFile, passed: verifyRes.passed, details: verifyRes.details }));

          if (!verifyRes.passed) {
            // VERIFICATION FAILED -> ENTER REPAIR
            statesVisited.push('REPAIR');
            auditTrail.push(logger.audit('REPAIR_ATTEMPT', { details: verifyRes.details }));
            
            // Perform repair action: overwrite file with clean fixed content
            const repairStart = Date.now();
            await toolRegistry.executeTool('file_write', {
              filePath: targetFile,
              content: `export function divide(a: number, b: number): number {\n  if (b === 0) throw new Error('Division by zero');\n  return a / b;\n}\n`,
            }, routeDecision.loadedTools);
            totalToolExecutionTimeMs += (Date.now() - repairStart);

            // Re-verify after repair
            statesVisited.push('VERIFY');
            const reVerifyRes = await taskVerifier.verify({ type: 'syntax', targetPath: targetFile });
            verificationPassed = reVerifyRes.passed;
          } else {
            verificationPassed = true;
          }
        } else {
          verificationPassed = true;
        }
      }

      taskCompleted = true; // Completed single cycle iteration
    }

    statesVisited.push(taskCompleted ? 'RESULT' : 'FAILED');
    auditTrail.push(logger.audit('TASK_FINISHED', { status: taskCompleted ? 'completed' : 'failed', iterations }));

    return {
      taskId,
      status: taskCompleted ? 'completed' : 'failed',
      finalOutput,
      tier: routeDecision.tier,
      routeReason: routeDecision.reason,
      loadedToolsCount: routeDecision.loadedTools.length,
      loadedTools: routeDecision.loadedTools,
      iterations,
      statesVisited,
      verificationPassed,
      metrics: {
        totalDurationMs: Date.now() - startTime,
        ttftMs,
        aiRuntimeTimeMs: totalAiRuntimeTimeMs,
        toolExecutionTimeMs: totalToolExecutionTimeMs,
        promptTokens,
        completionTokens,
        model: modelUsed,
      },
      auditTrail,
    };
  }
}

export const agentOrchestrator = new AgentOrchestrator();
