import crypto from 'node:crypto';
import type { TaskRequest, TaskResult } from '../shared/types.ts';
import { agentOrchestrator } from '../agent-engine/orchestrator.ts';
import { workerRegistry, type WorkerNode } from './worker-registry.ts';

export interface QueuedTask {
  id: string;
  request: TaskRequest;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: TaskResult;
  error?: string;
  assignedWorkerId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  abortController: AbortController;
}

export class TaskQueueScheduler {
  private queue: Map<string, QueuedTask> = new Map();
  private maxConcurrency: number = 4;

  public async enqueueTask(request: TaskRequest): Promise<QueuedTask> {
    const id = `qtask_${crypto.randomUUID().substring(0, 8)}`;
    const queuedTask: QueuedTask = {
      id,
      request,
      status: 'pending',
      createdAt: new Date().toISOString(),
      abortController: new AbortController(),
    };

    this.queue.set(id, queuedTask);
    this.processNext();
    return queuedTask;
  }

  public getTaskStatus(id: string): QueuedTask | undefined {
    return this.queue.get(id);
  }

  public cancelTask(id: string): boolean {
    const task = this.queue.get(id);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'running') {
      task.status = 'cancelled';
      task.abortController.abort();
      task.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public listTasks(): QueuedTask[] {
    return Array.from(this.queue.values());
  }

  private async processNext(): Promise<void> {
    const activeCount = Array.from(this.queue.values()).filter(t => t.status === 'running').length;
    if (activeCount >= this.maxConcurrency) return;

    const pending = Array.from(this.queue.values()).find(t => t.status === 'pending');
    if (!pending) return;

    const worker = workerRegistry.getAvailableWorker('local');
    if (!worker) return;

    pending.status = 'running';
    pending.assignedWorkerId = worker.id;
    pending.startedAt = new Date().toISOString();

    try {
      const result = await agentOrchestrator.executeTask(pending.request);
      if (!pending.abortController.signal.aborted) {
        pending.status = 'completed';
        pending.result = result;
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (!pending.abortController.signal.aborted) {
        pending.status = 'failed';
        pending.error = error.message;
      }
    } finally {
      pending.completedAt = new Date().toISOString();
      this.processNext();
    }
  }
}

export const taskQueueScheduler = new TaskQueueScheduler();
