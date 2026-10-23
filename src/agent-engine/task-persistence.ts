import fs from 'node:fs/promises';
import path from 'node:path';
import type { LongRunningTaskState, DeveloperPlan } from './developer-types.ts';

export class TaskPersistenceStore {
  private storeDir: string;

  constructor(storeDir: string = path.resolve(process.cwd(), 'scratch', 'persisted_tasks')) {
    this.storeDir = storeDir;
  }

  public async saveTask(task: LongRunningTaskState): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true });
    task.updatedAt = new Date().toISOString();
    const filePath = path.join(this.storeDir, `${task.taskId}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf-8');
  }

  public async getTask(taskId: string): Promise<LongRunningTaskState | null> {
    try {
      const filePath = path.join(this.storeDir, `${taskId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as LongRunningTaskState;
    } catch {
      return null;
    }
  }

  public async listTasks(): Promise<LongRunningTaskState[]> {
    try {
      await fs.mkdir(this.storeDir, { recursive: true });
      const files = await fs.readdir(this.storeDir);
      const tasks: LongRunningTaskState[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.storeDir, file), 'utf-8');
          tasks.push(JSON.parse(content) as LongRunningTaskState);
        }
      }
      return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return [];
    }
  }

  public async getIncompleteTasks(): Promise<LongRunningTaskState[]> {
    const all = await this.listTasks();
    return all.filter(t => t.status === 'running' || t.status === 'paused' || t.status === 'pending');
  }
}

export const taskPersistenceStore = new TaskPersistenceStore();
