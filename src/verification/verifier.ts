import fs from 'node:fs/promises';
import { executeCmdTool } from '../tool-runtime/cmd-tools.ts';

export interface VerificationRequest {
  type: 'syntax' | 'test' | 'file_exists' | 'build';
  targetPath?: string;
  expectedContent?: string;
}

export interface VerificationResult {
  passed: boolean;
  type: string;
  details: string;
  durationMs: number;
}

export class TaskVerifier {
  public async verify(req: VerificationRequest): Promise<VerificationResult> {
    const startTime = Date.now();

    switch (req.type) {
      case 'file_exists': {
        if (!req.targetPath) {
          return { passed: false, type: req.type, details: 'Missing targetPath', durationMs: Date.now() - startTime };
        }
        try {
          await fs.access(req.targetPath);
          return { passed: true, type: req.type, details: `File exists: ${req.targetPath}`, durationMs: Date.now() - startTime };
        } catch {
          return { passed: false, type: req.type, details: `File does not exist: ${req.targetPath}`, durationMs: Date.now() - startTime };
        }
      }

      case 'syntax': {
        if (!req.targetPath) {
          return { passed: false, type: req.type, details: 'Missing targetPath', durationMs: Date.now() - startTime };
        }
        const cmdRes = await executeCmdTool(`node --experimental-strip-types "${req.targetPath}"`);
        return {
          passed: cmdRes.success,
          type: req.type,
          details: cmdRes.success ? 'Syntax check passed.' : `Syntax error: ${cmdRes.error || cmdRes.output}`,
          durationMs: Date.now() - startTime,
        };
      }

      case 'test': {
        const cmdRes = await executeCmdTool(req.targetPath ? `node --test "${req.targetPath}"` : 'npm test');
        return {
          passed: cmdRes.success,
          type: req.type,
          details: cmdRes.output,
          durationMs: Date.now() - startTime,
        };
      }

      case 'build': {
        const cmdRes = await executeCmdTool('npm run build');
        return {
          passed: cmdRes.success,
          type: req.type,
          details: cmdRes.output,
          durationMs: Date.now() - startTime,
        };
      }

      default:
        return { passed: true, type: 'default', details: 'No explicit verifier required.', durationMs: Date.now() - startTime };
    }
  }
}

export const taskVerifier = new TaskVerifier();
