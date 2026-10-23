import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectCheckpoint } from './developer-types.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export class CheckpointManager {
  private baseCheckpointDir: string;

  constructor(baseDir: string = path.resolve(process.cwd(), 'scratch', 'checkpoints')) {
    this.baseCheckpointDir = baseDir;
  }

  public async createCheckpoint(planId: string, stepIndex: number, description: string, filesToSave: string[]): Promise<ProjectCheckpoint> {
    const checkpointId = `chk_${Date.now()}_step${stepIndex}`;
    const snapshotDir = path.join(this.baseCheckpointDir, planId, checkpointId);
    await fs.mkdir(snapshotDir, { recursive: true });

    const savedFiles: string[] = [];

    for (const filePath of filesToSave) {
      try {
        security.validatePathAccess(filePath, 'read');
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        if (exists) {
          const relPath = path.relative(process.cwd(), filePath);
          const destPath = path.join(snapshotDir, relPath);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(filePath, destPath);
          savedFiles.push(filePath);
        }
      } catch {
        // Skip unreadable / external files safely
      }
    }

    const checkpoint: ProjectCheckpoint = {
      id: checkpointId,
      planId,
      stepIndex,
      timestamp: new Date().toISOString(),
      description,
      snapshotDir,
      affectedFiles: savedFiles,
    };

    return checkpoint;
  }

  public async restoreCheckpoint(checkpoint: ProjectCheckpoint): Promise<boolean> {
    try {
      const exists = await fs.access(checkpoint.snapshotDir).then(() => true).catch(() => false);
      if (!exists) return false;

      await this.restoreDirRecursive(checkpoint.snapshotDir, process.cwd());
      return true;
    } catch {
      return false;
    }
  }

  private async restoreDirRecursive(src: string, destBase: string): Promise<void> {
    const items = await fs.readdir(src, { withFileTypes: true });
    for (const item of items) {
      const srcPath = path.join(src, item.name);
      if (item.isDirectory()) {
        await this.restoreDirRecursive(srcPath, destBase);
      } else if (item.isFile()) {
        const relPath = path.relative(src, srcPath);
        const destPath = path.resolve(destBase, relPath);
        security.validatePathAccess(destPath, 'write');
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const checkpointManager = new CheckpointManager();
