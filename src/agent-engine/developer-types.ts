export interface DeveloperPlanStep {
  id: string;
  title: string;
  description: string;
  type: 'analysis' | 'scaffold' | 'code' | 'test' | 'verify' | 'rollback';
  targetFiles?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface DeveloperPlan {
  id: string;
  projectPath: string;
  goal: string;
  steps: DeveloperPlanStep[];
  currentStepIndex: number;
  status: 'planned' | 'executing' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCheckpoint {
  id: string;
  planId: string;
  stepIndex: number;
  timestamp: string;
  description: string;
  snapshotDir: string;
  affectedFiles: string[];
}

export interface LongRunningTaskState {
  taskId: string;
  projectId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  goal: string;
  plan: DeveloperPlan;
  checkpoints: ProjectCheckpoint[];
  logs: string[];
  metrics: {
    durationMs: number;
    filesModifiedCount: number;
    testsRunCount: number;
  };
  createdAt: string;
  updatedAt: string;
}
