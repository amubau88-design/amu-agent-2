export interface WorkerNode {
  id: string;
  name: string;
  type: 'local' | 'lan_ai_worker' | 'tool_worker';
  endpoint: string;
  status: 'idle' | 'busy' | 'offline';
  capabilities: string[];
  lastHeartbeat: string;
}

export class WorkerRegistry {
  private workers: Map<string, WorkerNode> = new Map();

  constructor() {
    // Default local node
    this.registerWorker({
      id: 'worker-local-01',
      name: 'AMU Primary Local Node',
      type: 'local',
      endpoint: 'http://127.0.0.1:3000',
      status: 'idle',
      capabilities: ['agent_engine', 'ai_runtime', 'tool_execution'],
      lastHeartbeat: new Date().toISOString(),
    });
  }

  public registerWorker(worker: WorkerNode): void {
    this.workers.set(worker.id, worker);
  }

  public listWorkers(): WorkerNode[] {
    return Array.from(this.workers.values());
  }

  public updateHeartbeat(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = new Date().toISOString();
      worker.status = 'idle';
    }
  }

  public getAvailableWorker(type: 'local' | 'lan_ai_worker' | 'tool_worker' = 'local'): WorkerNode | undefined {
    return Array.from(this.workers.values()).find(
      w => w.type === type && w.status !== 'offline'
    );
  }
}

export const workerRegistry = new WorkerRegistry();
