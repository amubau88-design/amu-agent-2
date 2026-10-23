import crypto from 'node:crypto';
import { agentOrchestrator } from '../agent-engine/orchestrator.ts';
import { aiRuntimeManager } from '../ai-runtime/runtime-manager.ts';
import { taskRouter } from '../task-router/router.ts';
import { toolRegistry } from '../tool-runtime/tool-registry.ts';
import { workerRegistry } from '../scheduler/worker-registry.ts';
import { developerEngine } from '../agent-engine/developer-engine.ts';
import { taskPersistenceStore } from '../agent-engine/task-persistence.ts';
import { githubService } from '../github/github-service.ts';
import { localProjectManager } from '../projects/local-project-manager.ts';
import { serverManager } from '../servers/server-manager.ts';
import { deploymentManager } from '../deployment/deployment-manager.ts';
import { authService } from '../auth/auth-service.ts';
import { chatService } from '../chat/chat-service.ts';
import type { APIResponse, TaskResult } from '../shared/types.ts';

const tasksStore = new Map<string, TaskResult>();

export interface RequestContext {
  requestId: string;
  correlationId: string;
  apiKey?: string;
}

export async function handleApiRequest(
  method: string,
  pathname: string,
  body: Record<string, unknown> | null,
  context: RequestContext
): Promise<{ statusCode: number; response: APIResponse; isStream?: boolean }> {
  
  // 1. GET /api/v1/health
  if (method === 'GET' && pathname === '/api/v1/health') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: {
          status: 'healthy',
          version: '1.0.0-phase1',
          uptimeSeconds: Math.floor(process.uptime()),
          memoryUsage: process.memoryUsage(),
        },
      },
    };
  }

  // 1b. GET /api/v1/readiness
  if (method === 'GET' && pathname === '/api/v1/readiness') {
    const isReady = await aiRuntimeManager.getActiveAdapter().isHealthy();
    return {
      statusCode: isReady ? 200 : 503,
      response: {
        success: isReady,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: { ready: isReady, activeBackend: aiRuntimeManager.getActiveAdapter().name },
      },
    };
  }

  // 1c. GET /api/v1/agent/status
  if (method === 'GET' && pathname === '/api/v1/agent/status') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: {
          status: 'idle',
          activeTasksCount: tasksStore.size,
          registeredWorkers: workerRegistry.listWorkers().length,
        },
      },
    };
  }

  // 2. GET /api/v1/runtime/status
  if (method === 'GET' && pathname === '/api/v1/runtime/status') {
    const runtimeStatus = await aiRuntimeManager.getStatus();
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: runtimeStatus,
      },
    };
  }

  // 3. GET /api/v1/capabilities
  if (method === 'GET' && pathname === '/api/v1/capabilities') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: {
          availableTiers: ['GREETING', 'KNOWLEDGE', 'CODE', 'DEBUG', 'FULL_AGENT'],
          adapters: aiRuntimeManager.listAdapters(),
          registeredWorkers: workerRegistry.listWorkers(),
          availableTools: toolRegistry.getAvailableTools(['file_read', 'file_write', 'file_delete', 'execute_cmd', 'run_test', 'run_build']),
        },
      },
    };
  }

  // 4. POST /api/v1/chat
  if (method === 'POST' && pathname === '/api/v1/chat') {
    const prompt = (body?.prompt as string) || '';
    if (!prompt) {
      return {
        statusCode: 400,
        response: {
          success: false,
          requestId: context.requestId,
          correlationId: context.correlationId,
          timestamp: new Date().toISOString(),
          error: { code: 'INVALID_PROMPT', message: 'Field "prompt" is required.' },
        },
      };
    }

    const taskResult = await agentOrchestrator.executeTask(
      { prompt },
      context.correlationId,
      context.requestId
    );

    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: taskResult,
      },
    };
  }

  // 5. POST /api/v1/agent/tasks
  if (method === 'POST' && pathname === '/api/v1/agent/tasks') {
    const prompt = (body?.prompt as string) || '';
    if (!prompt) {
      return {
        statusCode: 400,
        response: {
          success: false,
          requestId: context.requestId,
          correlationId: context.correlationId,
          timestamp: new Date().toISOString(),
          error: { code: 'INVALID_PROMPT', message: 'Field "prompt" is required.' },
        },
      };
    }

    const taskResult = await agentOrchestrator.executeTask(
      {
        prompt,
        options: body?.options as Record<string, unknown>,
      },
      context.correlationId,
      context.requestId
    );

    tasksStore.set(taskResult.taskId, taskResult);

    return {
      statusCode: 202,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: taskResult,
      },
    };
  }

  // 6. GET /api/v1/agent/tasks/:id
  if (method === 'GET' && pathname.startsWith('/api/v1/agent/tasks/')) {
    const taskId = pathname.replace('/api/v1/agent/tasks/', '');
    const taskResult = tasksStore.get(taskId);

    if (!taskResult) {
      return {
        statusCode: 404,
        response: {
          success: false,
          requestId: context.requestId,
          correlationId: context.correlationId,
          timestamp: new Date().toISOString(),
          error: { code: 'TASK_NOT_FOUND', message: `Task '${taskId}' was not found.` },
        },
      };
    }

    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: taskResult,
      },
    };
  }

  // 7. DEVELOPER ENGINE: GET /api/v1/dev/tasks
  if (method === 'GET' && pathname === '/api/v1/dev/tasks') {
    const tasks = await taskPersistenceStore.listTasks();
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: tasks,
      },
    };
  }

  // 8. DEVELOPER ENGINE: POST /api/v1/dev/tasks (Create and start a long-running plan)
  if (method === 'POST' && pathname === '/api/v1/dev/tasks') {
    const goal = (body?.goal as string) || (body?.prompt as string) || '';
    if (!goal) {
      return {
        statusCode: 400,
        response: {
          success: false,
          requestId: context.requestId,
          correlationId: context.correlationId,
          timestamp: new Date().toISOString(),
          error: { code: 'INVALID_GOAL', message: 'Feld "goal" ist erforderlich.' },
        },
      };
    }

    const devTask = await developerEngine.createLongRunningTask(goal);
    // Execute first step synchronously
    await developerEngine.executeTaskStep(devTask.taskId);
    const updated = await taskPersistenceStore.getTask(devTask.taskId);

    return {
      statusCode: 201,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: updated,
      },
    };
  }

  // 9. DEVELOPER ENGINE: POST /api/v1/dev/tasks/:id/step
  if (method === 'POST' && pathname.includes('/api/v1/dev/tasks/') && pathname.endsWith('/step')) {
    const taskId = pathname.replace('/api/v1/dev/tasks/', '').replace('/step', '');
    const updated = await developerEngine.executeTaskStep(taskId);
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: updated,
      },
    };
  }

  // 10. DEVELOPER ENGINE: POST /api/v1/dev/tasks/:id/pause
  if (method === 'POST' && pathname.includes('/api/v1/dev/tasks/') && pathname.endsWith('/pause')) {
    const taskId = pathname.replace('/api/v1/dev/tasks/', '').replace('/pause', '');
    const updated = await developerEngine.pauseTask(taskId);
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: updated,
      },
    };
  }

  // 11. DEVELOPER ENGINE: POST /api/v1/dev/tasks/:id/resume
  if (method === 'POST' && pathname.includes('/api/v1/dev/tasks/') && pathname.endsWith('/resume')) {
    const taskId = pathname.replace('/api/v1/dev/tasks/', '').replace('/resume', '');
    const updated = await developerEngine.resumeTask(taskId);
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: updated,
      },
    };
  }

  // 12. DEVELOPER ENGINE: POST /api/v1/dev/tasks/:id/cancel
  if (method === 'POST' && pathname.includes('/api/v1/dev/tasks/') && pathname.endsWith('/cancel')) {
    const taskId = pathname.replace('/api/v1/dev/tasks/', '').replace('/cancel', '');
    const updated = await developerEngine.cancelTaskWithRollback(taskId);
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: updated,
      },
    };
  }

  // 13. GITHUB: GET /api/v1/github/status
  if (method === 'GET' && pathname === '/api/v1/github/status') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: githubService.getAuthConfig(),
      },
    };
  }

  // 14. GITHUB: GET /api/v1/github/repos
  if (method === 'GET' && pathname === '/api/v1/github/repos') {
    const repos = await githubService.listUserRepositories();
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: repos,
      },
    };
  }

  // 15. PROJECTS: GET /api/v1/projects
  if (method === 'GET' && pathname === '/api/v1/projects') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: localProjectManager.listProjects(),
      },
    };
  }

  // 16. PROJECTS: POST /api/v1/projects (Create new local app)
  if (method === 'POST' && pathname === '/api/v1/projects') {
    const name = (body?.name as string) || 'Neues-Projekt';
    const proj = await localProjectManager.createProject(name);
    return {
      statusCode: 201,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: proj,
      },
    };
  }

  // 17. PROJECTS: POST /api/v1/projects/:id/start
  if (method === 'POST' && pathname.includes('/api/v1/projects/') && pathname.endsWith('/start')) {
    const id = pathname.replace('/api/v1/projects/', '').replace('/start', '');
    const res = await localProjectManager.startProject(id);
    return {
      statusCode: res.success ? 200 : 500,
      response: {
        success: res.success,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: res,
      },
    };
  }

  // 18. PROJECTS: POST /api/v1/projects/:id/stop
  if (method === 'POST' && pathname.includes('/api/v1/projects/') && pathname.endsWith('/stop')) {
    const id = pathname.replace('/api/v1/projects/', '').replace('/stop', '');
    const res = await localProjectManager.stopProject(id);
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: res,
      },
    };
  }

  // 19. SERVERS: GET /api/v1/servers
  if (method === 'GET' && pathname === '/api/v1/servers') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: serverManager.listServers(),
      },
    };
  }

  // 20. DEPLOYMENTS: GET /api/v1/deployments
  if (method === 'GET' && pathname === '/api/v1/deployments') {
    return {
      statusCode: 200,
      response: {
        success: true,
        requestId: context.requestId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        data: deploymentManager.listDeployments(),
      },
    };
  }

  // 404 Not Found
  return {
    statusCode: 404,
    response: {
      success: false,
      requestId: context.requestId,
      correlationId: context.correlationId,
      timestamp: new Date().toISOString(),
      error: { code: 'ROUTE_NOT_FOUND', message: `Route '${method} ${pathname}' not found.` },
    },
  };
}
